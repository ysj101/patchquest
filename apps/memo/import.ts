// メモの取り込み。XML を libxml2 で解析し、<memos> の中の <memo>（<title> と <body>）を、取り込んだ利用者のメモとして保存する。
// パーサーの呼び出し方（オプション）は交換点 memo.import.parse が決める。パーサーが読もうとした資源と渡したバイト数は、実測を記録する
import type { AppResponse } from '../../platform/contract';
import type { ServerContext } from '../../runtimes/browser/app-module';
import type { Database } from '../../runtimes/browser/sqlite';
import { xmlOptionNames, type XmlNode, type XmlParseResult } from '../../runtimes/browser/xml';
import { json } from '../shared/http';
import type { ParseImport } from './hooks';
import { IMPORT_MAX_MEMOS, IMPORT_URL } from './import-xml';
import { BODY_MAX_LENGTH, TITLE_MAX_LENGTH, lengthError, type User } from './model';

const FILE_SCHEME = 'file://';
const encoder = new TextEncoder();

/** サーバの中のファイル（架空。初期データが作る）を読む。file: の URI で、ある場所のものだけを返す */
function readServerFile(db: Database, uri: string): Uint8Array | undefined {
  if (!uri.startsWith(`${FILE_SCHEME}/`)) return undefined;
  const body = db.selectValue('SELECT body FROM server_files WHERE path = ?', [uri.slice(FILE_SCHEME.length)]) as string | undefined;
  return body === undefined ? undefined : encoder.encode(body);
}

interface ImportedMemo {
  title: string;
  body: string;
}

const childText = (node: XmlNode, name: string): string | undefined => node.children.find((child) => child.name === name)?.text.trim();

/** 解析した XML から、取り込むメモを取り出す。形が合わなければ、利用者に示す説明（error）を返す */
function readMemos(root: XmlNode): { memos: ImportedMemo[] } | { error: string } {
  if (root.name !== 'memos') return { error: 'いちばん外側の要素は <memos> にしてください' };
  const items = root.children.filter((child) => child.name === 'memo');
  if (items.length === 0) return { error: '<memos> の中に <memo> がありません' };
  if (items.length > IMPORT_MAX_MEMOS) return { error: `1 回に取り込めるメモは ${IMPORT_MAX_MEMOS} 件までです` };
  const memos: ImportedMemo[] = [];
  for (const item of items) {
    const title = childText(item, 'title');
    const body = childText(item, 'body');
    if (!title || body === undefined) return { error: '<memo> には、空でない <title> と、<body> が必要です' };
    const tooLong = lengthError('タイトル', title, TITLE_MAX_LENGTH) ?? lengthError('本文', body, BODY_MAX_LENGTH);
    if (tooLong) return { error: tooLong };
    memos.push({ title, body });
  }
  return { memos };
}

const rejected = (ctx: ServerContext, message: string): AppResponse => {
  ctx.emit('validation.failed', { field: 'xml', message });
  return json(400, { error: message, field: 'xml' });
};

/** XML を解析して、中のメモを user のメモとして保存する。1 件でも形が合わなければ、何も保存しない */
export function importMemos(ctx: ServerContext, user: User, source: string): AppResponse {
  const parse = (xml: string, options: number): XmlParseResult => {
    const result = ctx.xml.parse(xml, { url: IMPORT_URL, options, read: (uri) => readServerFile(ctx.db, uri) });
    ctx.emit('xml.parse', {
      options: xmlOptionNames(options),
      resources: result.resources.map(({ uri, opened, bytes }) => ({ uri, opened, bytes })),
      loadedBytes: result.resources.reduce((sum, resource) => sum + resource.bytes, 0),
      ...(result.ok ? {} : { error: result.error }),
    });
    return result;
  };
  const result = ctx.hook<ParseImport>('memo.import.parse')(parse, source);
  if (!result.ok) return rejected(ctx, `XML を取り込めませんでした：${result.error}`);
  const read = readMemos(result.root);
  if ('error' in read) return rejected(ctx, read.error);
  // 所有者は常にセッションの利用者
  const imported = read.memos.map((memo) => {
    const created = ctx.db.selectObject('INSERT INTO memos (owner_id, title, body) VALUES (?, ?, ?) RETURNING id', [user.id, memo.title, memo.body]) as { id: number };
    return { id: created.id, ...memo };
  });
  return json(201, { imported });
}
