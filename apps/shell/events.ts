// 擬似シェルが記録する観測イベントと、やり取りの表示（観測ログと「加えた変更」で使う）。HTTP の形ではなく、端末の言葉で示す。計測した値だけを示す
import type { AppRequest, AppResponse, ExchangeDescription, JsonValue, ObservedEvent } from '../../platform/contract';

type JsonObject = Record<string, JsonValue>;

/** 計測した値を、そのまま文字にする */
const shown = (value: JsonValue | undefined): string => (typeof value === 'string' ? value : JSON.stringify(value ?? null));

const asObject = (value: JsonValue | undefined): JsonObject | null => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null);

/** 書き換えた行番号の並び（例：2・3） */
const lineNumbers = (lines: JsonValue | undefined): string => (Array.isArray(lines) ? lines.map(shown).join('・') : shown(lines));

export function describeEvent(event: ObservedEvent): string | null {
  const data = event.data;
  switch (event.type) {
    case 'sudo.decision':
      return `sudo の判断：${data.decision === 'allow' ? '許可' : '拒否'}（${shown(data.reason)}）・利用者 ${shown(data.user)}・コマンド ${shown(data.command)}・実行する利用者 ${shown(data.runAs)}`;
    case 'shell.exec':
      return `プログラムの実行：${shown(data.program)}・利用者 ${shown(data.user)}・実行した権限 ${shown(data.runAs)}`;
    case 'file.changed':
      return `ファイルの変更：${shown(data.path)} の ${lineNumbers(data.lines)} 行目・利用者 ${shown(data.user)}・実行した権限 ${shown(data.runAs)}`;
    default:
      return null;
  }
}

const isShell = (request: AppRequest): boolean => request.path === '/sh';

/** 要求に付いた、エディタで書き換えた行（行番号と内容）。付いていなければ空 */
function editsOf(body: JsonObject): { line: string; text: string }[] {
  const edits = Array.isArray(body.edits) ? body.edits : [];
  return edits.flatMap((edit) => {
    const fields = asObject(edit);
    return fields ? [{ line: shown(fields.line), text: shown(fields.text) }] : [];
  });
}

/**
 * やり取りの短い表示。コマンド行は端末に打った形（$ コマンド行）で示し、エディタで保存したときは書き換えた行を続ける。
 * 端末を開いたときの問い合わせは「端末を開く」。それ以外は説明しない
 */
export function describeRequest(request: AppRequest): string | null {
  if (!isShell(request)) return null;
  if (request.method === 'GET') return '端末を開く';
  const body = asObject(request.body);
  if (request.method !== 'POST' || !body || typeof body.line !== 'string') return null;
  const changes = editsOf(body).map((edit) => `${edit.line} 行目を「${edit.text}」に`).join('、');
  return changes === '' ? `$ ${body.line}` : `$ ${body.line}（${changes}書き換えて保存）`;
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
      ...(edits.length > 0 ? [{ title: 'エディタで書き換えた行', text: edits.map((edit) => `${edit.line} 行目：${edit.text}`).join('\n') }] : []),
      { title: '端末の出力', text: opened ? `（${shown(opened.path)} を編集画面で開きました）` : output || '（出力なし）' },
    ],
  };
}

/** 観測ログでの表示。コマンドを解釈できなかったやり取り（未ログインや形の違う要求）は説明せず、基盤の表示に任せる */
export function describeExchange(request: AppRequest, response: AppResponse): ExchangeDescription | null {
  const body = asObject(response.body);
  if (!isShell(request) || response.status !== 200 || !body) return null;
  if (request.method === 'GET') return { mark: { ok: true, text: '端末' }, blocks: [{ title: 'プロンプト', text: `${shown(body.user)}@${shown(body.host)}:${shown(body.cwd)}$` }] };
  const sent = asObject(request.body);
  return request.method === 'POST' && sent ? describeCommand(sent, body) : null;
}
