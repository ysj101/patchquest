// XML のパーサー（libxml2 の WASM）。外部の資源は渡した読み手からだけ読み、どのオプションで読みに行くかは本物の libxml2 が決める（Issue #239 の PoC）
import { ParseOption } from 'libxml2-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadXmlParser } from '../../runtimes/browser/libxml2';
import { XmlParseOption, xmlOptionNames, type XmlParser } from '../../runtimes/browser/xml';

const { XML_PARSE_NOENT, XML_PARSE_NONET, XML_PARSE_NO_XXE } = XmlParseOption;
const URL = 'file:///srv/app/uploads/doc.xml';
const SECRET = '合言葉は「ひまわり」';
const FILES: Record<string, string> = { 'file:///srv/app/secret.txt': SECRET, 'file:///etc/hostname': 'app-01\n' };

const encoder = new TextEncoder();
const bytesOf = (text: string) => encoder.encode(text).byteLength;
const read = (uri: string) => (uri in FILES ? encoder.encode(FILES[uri]) : undefined);
// ネットワークの先を指す場所。読み手には届かないことを確かめるためのもので、通信はしない
const NETWORK_URI = ['http:', '//example.invalid/x'].join('');
const external = (systemId: string) => `<!DOCTYPE doc [<!ENTITY file SYSTEM "${systemId}"><!ENTITY sign "田中より">]><doc><a>&sign;</a><b>&file;</b></doc>`;

describe('libxml2 での XML の解析', () => {
  let parser: XmlParser;
  beforeAll(async () => {
    parser = await loadXmlParser();
  });
  const parse = (source: string, options: number) => parser.parse(source, { url: URL, options, read });

  it('オプションの値は、libxml2 のものと同じ', () => {
    expect(XmlParseOption).toEqual({ XML_PARSE_NOENT: ParseOption.XML_PARSE_NOENT, XML_PARSE_NONET: ParseOption.XML_PARSE_NONET, XML_PARSE_NO_XXE: ParseOption.XML_PARSE_NO_XXE });
  });

  it('オプションの値を、名前の一覧にする。名前のない値は数のまま残す', () => {
    expect(xmlOptionNames(0)).toEqual([]);
    expect(xmlOptionNames(XML_PARSE_NOENT | XML_PARSE_NO_XXE)).toEqual(['XML_PARSE_NOENT', 'XML_PARSE_NO_XXE']);
    expect(xmlOptionNames(XML_PARSE_NONET | 4)).toEqual(['XML_PARSE_NONET', '4']);
  });

  it('要素の名前・中の文字・子の要素を返し、読み込みは 1 回だけにする', async () => {
    expect(await loadXmlParser()).toBe(parser);
    expect(parse('<doc><a>あ &amp; い</a><b><c>う</c></b></doc>', 0)).toEqual({
      ok: true,
      root: { name: 'doc', text: 'あ & いう', children: [{ name: 'a', text: 'あ & い', children: [] }, { name: 'b', text: 'う', children: [{ name: 'c', text: 'う', children: [] }] }] },
      resources: [],
    });
  });

  it('XML_PARSE_NOENT を付けると、外部実体が指す資源を読み手に求め、中身に置き換える。求めた URI と渡したバイト数を記録する', () => {
    const result = parse(external('file:///srv/app/secret.txt'), XML_PARSE_NOENT);
    expect(result).toMatchObject({ ok: true, root: { children: [{ text: '田中より' }, { text: SECRET }] } });
    expect(result.resources).toEqual([{ uri: 'file:///srv/app/secret.txt', opened: true, bytes: bytesOf(SECRET) }]);
  });

  it('場所だけの指定と、文書の置き場からたどる指定は、文書の URI を基準にした URI で求められる', () => {
    expect(parse(external('/etc/hostname'), XML_PARSE_NOENT).resources).toEqual([{ uri: 'file:///etc/hostname', opened: true, bytes: 7 }]);
    expect(parse(external('../secret.txt'), XML_PARSE_NOENT).resources).toEqual([{ uri: 'file:///srv/app/secret.txt', opened: true, bytes: bytesOf(SECRET) }]);
  });

  it('XML_PARSE_NO_XXE を足すと、外部実体の資源を求めない。文書の中で決めた実体は置き換わる', () => {
    expect(parse(external('file:///srv/app/secret.txt'), XML_PARSE_NOENT | XML_PARSE_NO_XXE)).toMatchObject({ ok: true, root: { children: [{ text: '田中より' }, { text: '' }] }, resources: [] });
  });

  it('オプションを付けなければ、外部実体の資源を求めない', () => {
    expect(parse(external('file:///srv/app/secret.txt'), 0)).toMatchObject({ ok: true, root: { children: [{ text: '田中より' }, { text: '' }] }, resources: [] });
  });

  it('XML_PARSE_NONET は、ファイルの読み込みを止めない。ネットワークの先の資源は、読み手に求める前に断る', () => {
    expect(parse(external('file:///srv/app/secret.txt'), XML_PARSE_NOENT | XML_PARSE_NONET)).toMatchObject({ ok: true, root: { children: [{}, { text: SECRET }] } });
    const network = parse(external(NETWORK_URI), XML_PARSE_NOENT | XML_PARSE_NONET);
    expect(network).toMatchObject({ ok: false, resources: [] });
  });

  it('読み手が持たない資源は、開けなかったと記録し、中身は空になる', () => {
    expect(parse(external('file:///nowhere.txt'), XML_PARSE_NOENT)).toMatchObject({
      ok: true,
      root: { children: [{}, { text: '' }] },
      resources: [{ uri: 'file:///nowhere.txt', opened: false, bytes: 0 }],
    });
  });

  it('閉じていない XML は、理由を付けて失敗として返す', () => {
    expect(parse('<doc><a>', 0)).toEqual({ ok: false, error: expect.stringContaining('Premature end of data') as string, resources: [] });
  });

  it('解析に失敗しても、それまでに読んだ資源は記録に残る', () => {
    const result = parse('<!DOCTYPE doc [<!ENTITY % file SYSTEM "file:///etc/hostname">%file;]><doc/>', XML_PARSE_NOENT);
    expect(result).toMatchObject({ ok: false, resources: [{ uri: 'file:///etc/hostname', opened: true, bytes: 7 }] });
  });

  it('実体を何重にも重ねて大きくふくらませる XML は、libxml2 が断る', () => {
    const level = (i: number) => {
      const tenfold = `&a${i};`.repeat(10);
      return `<!ENTITY a${i + 1} "${tenfold}">`;
    };
    const levels = Array.from({ length: 11 }, (_, i) => level(i)).join('');
    const result = parse(`<!DOCTYPE doc [<!ENTITY a0 "${'lol'.repeat(15)}">${levels}]><doc>&a11;</doc>`, XML_PARSE_NOENT);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('amplification') as string });
  });
});
