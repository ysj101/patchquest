// ミッション「XML の取り込みで、サーバのファイルが混ざるのを防ぐ」（XXE、Issue #239）。
// 出荷前検証（全 seed・対策の expected）は全パック共通のテストが確かめる。ここでは、再現の判定と、観測ログに出る値が実測であることを確かめる
import { describe, expect, it } from 'vitest';
import { memoApp } from '../../../apps/memo';
import { describeEvent, describeExchange } from '../../../apps/memo/events';
import { PLAIN_XML, SERVER_FILES, externalEntityXml } from '../../../apps/memo/import-xml';
import { xxePack } from '..';
import type { AppRequest, Exchange, InvokeResult } from '../../../platform/contract';
import { detectReproduction } from '../../../platform/evaluator/evaluator';
import { AppEngine } from '../../../runtimes/browser/engine';

const ENV_URI = `file://${SERVER_FILES.env}`;
/** 設定ファイルのパスワード（seed ごとに変わる目印）の、fixture での名前 */
const PASSWORD_REF = 'server.env.password';
const importRequest = (xml: string): AppRequest => ({ method: 'POST', path: '/api/import', body: { xml } });

/** 取り込みの交換点に implementation を入れた実行環境で、bob として XML を取り込む */
async function importWith(implementation: string, xml: string, seed = 7): Promise<{ result: InvokeResult; refs: Record<string, unknown> }> {
  const engine = new AppEngine();
  const { refs } = await engine.prepare({
    attemptId: `xxe-${seed}`,
    app: { id: 'memo', version: memoApp.descriptor.version },
    fixture: { generator: 'memo.default', seed },
    implementations: { 'memo.import.parse': implementation },
  });
  const session = (await engine.invoke({ kind: 'session', actor: 'bob' })).session ?? null;
  const result = await engine.invoke({ kind: 'request', session, request: importRequest(xml) });
  await engine.dispose();
  return { result, refs };
}

describe('再現の判定', () => {
  const MARK = 'pq-0a1b2c';
  const refs = { [PASSWORD_REF]: MARK, 'server.hostname': 'memo-app-42' };
  const imported = (actor: string, body: string, status = 201): Exchange => ({
    runId: 'r1',
    actor,
    kind: 'request',
    request: importRequest('<memos/>'),
    response: { status, body: { imported: [{ id: 1, title: '取り込みの確認', body }] } },
    events: [],
  });

  it('だれが取り込んでも、設定ファイルのパスワードが応答に入れば再現とみなす。サーバの名前だけでは再現にしない', () => {
    const { probes } = xxePack.manifest;
    expect(detectReproduction(imported('carol', `APP_ENV=production\nMAIL_PASSWORD=${MARK}`), probes, refs)).toBe('read-env');
    expect(detectReproduction(imported('alice', `MAIL_PASSWORD=${MARK}`), probes, refs)).toBe('read-env');
    expect(detectReproduction(imported('bob', 'memo-app-42'), probes, refs)).toBeNull();
    expect(detectReproduction(imported('bob', `MAIL_PASSWORD=${MARK}`, 400), probes, refs)).toBeNull();
  });
});

describe('観測ログに出る値', () => {
  it('注入した実装では、求められた資源の URI と、渡したバイト数（設定ファイルの大きさ）が出て、中身がメモの本文になる', async () => {
    const { result, refs } = await importWith('xxe/import-noent', externalEntityXml(ENV_URI));
    const env = `APP_ENV=production\nMAIL_PASSWORD=${String(refs[PASSWORD_REF])}`;
    const bytes = new TextEncoder().encode(env).byteLength + 1;
    expect(result.response).toMatchObject({ status: 201, body: { imported: [{ title: '取り込みの確認', body: env }] } });
    expect(result.events.map((event) => describeEvent(event))).toEqual([
      `XML の解析：オプション XML_PARSE_NOENT\n求められた資源：${ENV_URI}（渡した ${bytes} バイト）`,
    ]);
  });

  it('seed が変わると、読まれるパスワードも変わる', async () => {
    const [first, second] = await Promise.all([importWith('xxe/import-noent', externalEntityXml(ENV_URI), 1), importWith('xxe/import-noent', externalEntityXml(ENV_URI), 2)]);
    expect(first.refs[PASSWORD_REF]).not.toBe(second.refs[PASSWORD_REF]);
    expect(JSON.stringify(first.result.response?.body)).toContain(String(first.refs[PASSWORD_REF]));
    expect(JSON.stringify(second.result.response?.body)).not.toContain(String(first.refs[PASSWORD_REF]));
  });

  it('ない場所を指すと、開けなかったと出て、本文は空になる', async () => {
    const { result } = await importWith('xxe/import-noent', externalEntityXml('file:///srv/memo/nothing'));
    expect(result.response).toMatchObject({ status: 201, body: { imported: [{ body: '' }] } });
    expect(result.events.map((event) => describeEvent(event))).toEqual(['XML の解析：オプション XML_PARSE_NOENT\n求められた資源：file:///srv/memo/nothing（開けなかった）']);
  });

  it('ネットワークからの読み込みを禁じても、サーバのファイルは渡る', async () => {
    const { result, refs } = await importWith('xxe/import-nonet', externalEntityXml(ENV_URI));
    expect(JSON.stringify(result.response?.body)).toContain(String(refs[PASSWORD_REF]));
    expect(result.events.map((event) => describeEvent(event)).at(0)).toContain('オプション XML_PARSE_NOENT | XML_PARSE_NONET\n求められた資源：file:///srv/memo/.env（渡した');
  });

  it('外部実体の読み込みを禁じると、資源は求められず、パスワードは応答に入らない', async () => {
    const { result, refs } = await importWith('memo/import-no-xxe', externalEntityXml(ENV_URI));
    expect(result.response).toMatchObject({ status: 201, body: { imported: [{ body: '' }] } });
    expect(JSON.stringify(result.response?.body)).not.toContain(String(refs[PASSWORD_REF]));
    expect(result.events.map((event) => describeEvent(event))).toEqual(['XML の解析：オプション XML_PARSE_NOENT | XML_PARSE_NO_XXE\n求められた資源：なし']);
  });

  it('取り込みを止めると、パーサーを呼ばないので、解析の記録は残らない', async () => {
    const { result } = await importWith('xxe/import-disabled', PLAIN_XML);
    expect(result.response).toEqual({ status: 400, body: { error: 'XML を取り込めませんでした：取り込みは停止しています', field: 'xml' } });
    expect(result.events.map((event) => event.type)).toEqual(['validation.failed']);
  });

  it('解析に失敗したときは、libxml2 が出した理由を示す', async () => {
    const { result } = await importWith('xxe/import-noent', '<memos><memo>');
    expect(result.response?.status).toBe(400);
    expect(result.events.map((event) => describeEvent(event)).at(0)).toMatch(/^XML の解析：オプション XML_PARSE_NOENT\n求められた資源：なし\n解析の失敗：Premature end of data/);
  });

  it('取り込みのやり取りは、取り込んだ XML を書いたとおりに示す。ほかのやり取りは説明しない', () => {
    const response = { status: 201, body: { imported: [] } };
    expect(describeExchange(importRequest(PLAIN_XML), response)).toEqual({
      mark: { ok: true, text: '201' },
      blocks: [
        { title: '取り込んだ XML', text: PLAIN_XML },
        { title: '応答（status 201）', text: '{\n  "imported": []\n}' },
      ],
    });
    expect(describeExchange(importRequest(PLAIN_XML), { status: 400, body: { error: 'x' } })?.mark).toEqual({ ok: false, text: '400' });
    expect(describeExchange({ method: 'GET', path: '/api/memos' }, response)).toBeNull();
    expect(describeExchange({ method: 'POST', path: '/api/import', body: { xml: 1 } }, response)).toBeNull();
  });
});

describe('取り込む XML の形', () => {
  const xml = (inner: string) => `<memos>${inner}</memos>`;
  it.each([
    ['いちばん外側が <memos> でない', '<notes/>', 'いちばん外側の要素は <memos> にしてください'],
    ['<memo> がない', xml(''), '<memos> の中に <memo> がありません'],
    ['<title> が空', xml('<memo><title> </title><body>本文</body></memo>'), '<memo> には、空でない <title> と、<body> が必要です'],
    ['<body> がない', xml('<memo><title>題</title></memo>'), '<memo> には、空でない <title> と、<body> が必要です'],
    ['タイトルが長すぎる', xml(`<memo><title>${'あ'.repeat(41)}</title><body>本文</body></memo>`), 'タイトルは 40 文字以内にしてください'],
    ['メモが多すぎる', xml('<memo><title>題</title><body/></memo>'.repeat(21)), '1 回に取り込めるメモは 20 件までです'],
  ])('%s と、理由を示して断る', async (_, source, message) => {
    const { result } = await importWith('memo/import-no-xxe', source);
    expect(result.response).toEqual({ status: 400, body: { error: message, field: 'xml' } });
  });

  it('大きすぎる XML は、パーサーに渡さずに断る', async () => {
    const { result } = await importWith('memo/import-no-xxe', xml(`<!--${'x'.repeat(4000)}-->`));
    expect(result.response?.status).toBe(400);
    expect(result.events.map((event) => event.type)).toEqual(['validation.failed']);
  });

  it('メモが複数あれば、すべて取り込む', async () => {
    const { result } = await importWith('memo/import-no-xxe', xml('<memo><title>一</title><body>い</body></memo><memo><title>二</title><body/></memo>'));
    expect(result.response).toMatchObject({ status: 201, body: { imported: [{ title: '一', body: 'い' }, { title: '二', body: '' }] } });
  });
});
