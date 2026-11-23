// 擬似シェルが記録する観測イベントと、やり取りの表示（観測ログ・「加えた変更」・テストの結果で使う）。HTTP の形ではなく、端末の言葉で示す。計測した値だけを示す
import type { AppRequest, AppResponse, ExchangeDescription, JsonValue, ObservedEvent, ResponseExpectation } from '../../platform/contract';

type JsonObject = Record<string, JsonValue>;

/** 計測した値を、そのまま文字にする */
export const shown = (value: JsonValue | undefined): string => (typeof value === 'string' ? value : JSON.stringify(value ?? null));

const asObject = (value: JsonValue | undefined): JsonObject | null => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null);

/** 行を足した場所の言い方（0 は先頭） */
const below = (row: JsonValue | undefined): string => (row === 0 ? '先頭' : `${shown(row)} 行目の下`);

/** 行番号の並び（例：2・3） */
const lineNumbers = (lines: JsonValue | undefined): string => (Array.isArray(lines) ? lines.map(shown).join('・') : shown(lines));
const some = (rows: JsonValue | undefined): rows is JsonValue[] => Array.isArray(rows) && rows.length > 0;

/** ファイルの変更で、変わった行の説明（書き換えた行・消した行・下に行を足した場所）。行が分からない記録（本物の Linux）はそのまま示す */
function changedRows(data: JsonObject): string {
  const changes = [...(some(data.removed) ? [`${lineNumbers(data.removed)} 行目（削除）`] : []), ...(some(data.addedAfter) ? [`${data.addedAfter.map(below).join('・')}（追加）`] : [])];
  return [...(some(data.lines) || changes.length === 0 ? [`${lineNumbers(data.lines)} 行目`] : []), ...changes].join('・');
}

/** 観測ログの項目名。表示と、課題パックの文章が名指しできる名前（AppModule.eventLabels）の両方に使う */
export const EVENT_LABELS = { 'sudo.decision': 'sudo の判断', 'shell.exec': 'プログラムの実行', 'file.changed': 'ファイルの変更' } as const;

export function describeEvent(event: ObservedEvent): string | null {
  const data = event.data;
  switch (event.type) {
    case 'sudo.decision':
      return `${EVENT_LABELS['sudo.decision']}：${data.decision === 'allow' ? '許可' : '拒否'}（${shown(data.reason)}）・利用者 ${shown(data.user)}・コマンド ${shown(data.command)}・実行する利用者 ${shown(data.runAs)}`;
    case 'shell.exec':
      return `${EVENT_LABELS['shell.exec']}：${shown(data.program)}・利用者 ${shown(data.user)}・実行した権限 ${shown(data.runAs)}`;
    case 'file.changed':
      return `${EVENT_LABELS['file.changed']}：${shown(data.path)} の ${changedRows(data)}・利用者 ${shown(data.user)}・実行した権限 ${shown(data.runAs)}`;
    default:
      return null;
  }
}

const isShell = (request: AppRequest): boolean => request.path === '/sh';

/** エディタでの編集 1 件の表示。phrase は「…して保存」と続ける短い言い方、detail は観測ログでの 1 行 */
interface ShownEdit {
  phrase: string;
  /** phrase のあとに続ける語（書き換え「て」保存・削除「して」保存） */
  joint: string;
  detail: string;
}

function shownEdit(fields: JsonObject): ShownEdit {
  if (fields.after !== undefined) return { phrase: `${below(fields.after)}に「${shown(fields.text)}」を追加`, joint: 'して', detail: `${below(fields.after)}に追加：${shown(fields.text)}` };
  if (fields.remove === true) return { phrase: `${shown(fields.line)} 行目を削除`, joint: 'して', detail: `${shown(fields.line)} 行目：（削除）` };
  return { phrase: `${shown(fields.line)} 行目を「${shown(fields.text)}」に書き換え`, joint: 'て', detail: `${shown(fields.line)} 行目：${shown(fields.text)}` };
}

/** 要求に付いた、エディタでの編集（行の書き換え・削除・追加）。付いていなければ空 */
function editsOf(body: JsonObject): ShownEdit[] {
  const edits = Array.isArray(body.edits) ? body.edits : [];
  return edits.flatMap((edit) => {
    const fields = asObject(edit);
    return fields ? [shownEdit(fields)] : [];
  });
}

/**
 * やり取りの短い表示。コマンド行は端末に打った形（$ コマンド行）で示し、エディタで保存したときは編集の内容を続ける。
 * 端末を開いたときの問い合わせは「端末を開く」。それ以外は説明しない
 */
export function describeRequest(request: AppRequest): string | null {
  if (!isShell(request)) return null;
  if (request.method === 'GET') return '端末を開く';
  const body = asObject(request.body);
  if (request.method !== 'POST' || !body || typeof body.line !== 'string') return null;
  const edits = editsOf(body);
  const final = edits.at(-1);
  return final ? `$ ${body.line}（${edits.map((edit) => edit.phrase).join('、')}${final.joint}保存）` : `$ ${body.line}`;
}

/** 未ログインの要求を断った応答の状態コード */
const LOGIN_REQUIRED = 401;

/** テストの結果での、期待する結果の表示。未ログインを断る期待と、終了コードの期待だけを示し、なければ説明しない */
export function describeExpectation(expectation: ResponseExpectation): string | null {
  if (expectation.status === LOGIN_REQUIRED) return 'ログインを求めて断る';
  const exit = expectation.body?.find((matcher) => matcher.path === 'exit')?.is;
  if (exit === undefined) return null;
  if ('equals' in exit) return `終了コード ${shown(exit.equals)}`;
  if ('notEquals' in exit) return `終了コード ${shown(exit.notEquals)} 以外`;
  return null;
}

const text = (value: JsonValue | undefined): string => (typeof value === 'string' ? value : '');

/** コマンド行を実行したやり取り。結果の印は終了コードで、中身はコマンド・書き換えた行・端末の出力 */
function describeCommand(request: JsonObject, response: JsonObject): ExchangeDescription | null {
  if (typeof request.line !== 'string' || typeof response.exit !== 'number') return null;
  const edits = editsOf(request);
  const output = [text(response.stdout), text(response.stderr)].filter((part) => part !== '').join('\n');
  const opened = asObject(response.editor);
  return {
    mark: { ok: response.exit === 0, text: `終了コード ${response.exit}` },
    blocks: [
      { title: 'コマンド', text: `$ ${request.line}\n（実行した場所：${shown(response.cwd)}）` },
      ...(edits.length > 0 ? [{ title: 'エディタで変えた行', text: edits.map((edit) => edit.detail).join('\n') }] : []),
      { title: '端末の出力', text: opened ? `（${shown(opened.path)} を編集画面で開きました）` : output || '（出力なし）' },
    ],
  };
}

/** 未ログインで断ったやり取り。結果の印と中身は、応答の断りの文 */
function describeLoginRequired(body: JsonObject): ExchangeDescription | null {
  return typeof body.error === 'string' ? { mark: { ok: false, text: body.error }, blocks: [{ title: '端末の出力', text: body.error }] } : null;
}

/** 観測ログとテストの結果での表示。コマンドを解釈できなかったやり取り（形の違う要求）は説明せず、基盤の表示に任せる */
export function describeExchange(request: AppRequest, response: AppResponse): ExchangeDescription | null {
  const body = asObject(response.body);
  if (!isShell(request) || !body) return null;
  if (response.status === LOGIN_REQUIRED) return describeLoginRequired(body);
  if (response.status !== 200) return null;
  if (request.method === 'GET') return { mark: { ok: true, text: '端末' }, blocks: [{ title: 'プロンプト', text: `${shown(body.user)}@${shown(body.host)}:${shown(body.cwd)}$` }] };
  const sent = asObject(request.body);
  return request.method === 'POST' && sent ? describeCommand(sent, body) : null;
}
