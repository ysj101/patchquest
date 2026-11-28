// libxml2（WASM。libxml2-wasm）を読み込み、XML を解析する。WASM は libxml2-wasm のスクリプトに埋め込まれている。
// ブラウザでは、ビルドがこのスクリプトを別のファイル（assets/libxml2.js）に分け、Worker が最初の準備の中（通信の API を塞ぐ前）で読み込む。
// 外部の資源（外部実体など）は、libxml2 の入力の仕組み（xmlRegisterInputCallbacks）につないだ読み手からだけ渡す。
// 実物のファイルシステムやネットワークへは届かない
import type { XmlDocument, XmlElement } from 'libxml2-wasm';
import type { XmlNode, XmlParseRequest, XmlParseResult, XmlParser, XmlResource } from './xml';

type Libxml2 = typeof import('libxml2-wasm');

/** 開いている資源の読み取り位置。バイト数は、渡した分だけ resource に足す */
interface OpenFile {
  data: Uint8Array;
  offset: number;
  resource: XmlResource;
}

/** 1 回の解析のあいだの、資源の読み手と記録 */
interface Session {
  read: XmlParseRequest['read'];
  resources: XmlResource[];
  files: Map<number, OpenFile>;
}

function toNode(lib: Libxml2, element: XmlElement): XmlNode {
  const children: XmlNode[] = [];
  for (let child = element.firstChild; child; child = child.next) {
    if (child instanceof lib.XmlElement) children.push(toNode(lib, child));
  }
  return { name: element.name, text: element.content, children };
}

function createParser(lib: Libxml2): XmlParser {
  let session: Session | undefined;
  // 0 は libxml2 が「開けなかった」と読むので、1 から数える
  let lastFd = 0;

  lib.xmlRegisterInputProvider({
    // 解析の途中に求められた資源は、すべてここで受ける（libxml2 が自分でファイルを開きに行かないようにする）
    match: () => session !== undefined,
    open(uri) {
      if (!session) return undefined;
      const data = session.read(uri);
      const resource: XmlResource = { uri, opened: data !== undefined, bytes: 0 };
      session.resources.push(resource);
      if (!data) return undefined;
      lastFd += 1;
      session.files.set(lastFd, { data, offset: 0, resource });
      return lastFd;
    },
    read(fd, buffer) {
      const file = session?.files.get(fd);
      if (!file) return -1;
      const length = Math.min(buffer.byteLength, file.data.byteLength - file.offset);
      buffer.set(file.data.subarray(file.offset, file.offset + length));
      file.offset += length;
      file.resource.bytes += length;
      return length;
    },
    close: (fd) => session?.files.delete(fd) ?? false,
  });

  return {
    parse(source, { url, options, read }): XmlParseResult {
      if (session) throw new Error('XML の解析の途中で、別の解析は始められません');
      const current: Session = { read, resources: [], files: new Map() };
      session = current;
      let doc: XmlDocument | undefined;
      try {
        // options は XmlParseOption の組み合わせ。値は libxml2-wasm の ParseOption と同じ（tests/unit/xml.test.ts が確かめる）
        const settings: { url: string; option: number } = { url, option: options };
        doc = lib.XmlDocument.fromString(source, settings);
        return { ok: true, root: toNode(lib, doc.root), resources: current.resources };
      } catch (error) {
        // 文書の誤りは結果として返す。それ以外（ライブラリの異常）は、そのまま知らせる
        if (!(error instanceof lib.XmlParseError)) throw error;
        return { ok: false, error: error.message.trim(), resources: current.resources };
      } finally {
        doc?.dispose();
        session = undefined;
      }
    },
  };
}

// WASM の読み込みは 1 実行環境につき 1 回にする
let parser: Promise<XmlParser> | undefined;

export function loadXmlParser(): Promise<XmlParser> {
  parser ??= import('libxml2-wasm').then(createParser);
  return parser;
}
