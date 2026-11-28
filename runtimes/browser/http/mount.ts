// Service Worker が返す本物の HTTP 応答と、教材アプリのやり取り（AppRequest・AppResponse）のあいだの変換。
// Service Worker と Host の両方が使う。DOM にも Service Worker にも触れないので、ユニットテストで確かめる
import { isObj, type AppRequest, type AppResponse } from '../../../platform/contract';

/** Service Worker と Host のあいだのメッセージの版。配布物を入れ替えたあとに古い Service Worker が残っていたら、Host が気づけるようにする */
export const HTTP_PROTOCOL = 1;
/** Service Worker のファイル名と、受け持つ範囲（スコープ）。どちらも assets/ からの相対で、配信するサブパスが変わっても同じ形で登録できる */
export const HTTP_WORKER_FILE = 'http-server.js';
export const HTTP_SCOPE_DIR = 'http/';

/**
 * 画面を HTTP 応答として出す教材アプリ（AppModule.http）が、応答の本文に入れる形。
 * headers の名前は小文字で書く。html は文書の全体で、リダイレクトのように本文がない応答では空文字にする
 */
export interface HttpBody {
  headers: Record<string, string>;
  html: string;
}

/** Service Worker から Host への問い合わせ。path は教材アプリの中のパス（クエリを含む）、form は POST の本文（フォームの形式）で、GET では null */
export interface RelayRequest {
  protocol: number;
  instance: string;
  method: string;
  path: string;
  form: string | null;
}

/** Host から Service Worker への答え。Service Worker は、隔離のヘッダを足して、そのまま HTTP 応答にする */
export interface RelayReply {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * すべての応答に付ける隔離（spec §14）。sandbox で文書は不透明なオリジンになり、学習UIの保存領域と DOM に届かない。
 * スクリプトは許可しない（教材アプリの画面は、リンクとフォームだけで動く）。外部のファイルの読み込みも禁じる
 */
const ISOLATION_POLICY = "sandbox allow-forms; default-src 'none'; style-src 'unsafe-inline'";

const INSTANCE = /^[a-z0-9]+$/;
/** / で始まり、// や /\ ではないもの。ブラウザは // と /\ で始まる値を、別のサイトのアドレスとして読む */
const APP_PATH = /^\/(?![/\\])/;

/** 応答のヘッダに隔離を足す。教材アプリが自分で付けた Content-Security-Policy は消さず、別のポリシーとして並べる（どちらも効く） */
export function isolate(headers: Record<string, string>): Record<string, string> {
  const given = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  const own = given['content-security-policy'];
  return {
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    ...given,
    'content-security-policy': own === undefined ? ISOLATION_POLICY : `${own}, ${ISOLATION_POLICY}`,
  };
}

/** Service Worker が受けた URL を、インスタンスと教材アプリの中のパスに分ける。範囲の外や形の違う URL は null */
export function parseScoped(url: string, scope: string): { instance: string; path: string } | null {
  if (!url.startsWith(scope)) return null;
  const rest = url.slice(scope.length).split('#')[0] ?? '';
  const slash = rest.indexOf('/');
  const instance = slash < 0 ? '' : rest.slice(0, slash);
  return INSTANCE.test(instance) ? { instance, path: rest.slice(slash) } : null;
}

/**
 * 教材アプリの中のパス（/ で始まる）を、ブラウザと同じ読み方でそろえる（.. は先頭より上へ出ない）。パスでないものは null。
 * origin は読み方をそろえるための土台で、結果には残らない
 */
export function normalizeAppPath(path: string, origin: string): string | null {
  if (!APP_PATH.test(path)) return null;
  const url = new URL(path, origin);
  return `${url.pathname}${url.search}`;
}

/** ブラウザから届いたリクエストを、教材アプリへの呼び出しにする。フォームの本文は、名前と値の組にする。GET と POST 以外は null */
export function toAppRequest(method: string, path: string, form: string | null): AppRequest | null {
  if (method !== 'GET' && method !== 'POST') return null;
  if (form === null) return { method, path };
  return { method, path, body: Object.fromEntries(new URLSearchParams(form)) };
}

/** 応答の本文が、ヘッダと HTML の形か */
export const isHttpBody = (body: unknown): body is HttpBody =>
  isObj(body) && typeof body.html === 'string' && isObj(body.headers) && Object.values(body.headers).every((value) => typeof value === 'string');

/** 教材アプリの置き場所。mount は、範囲の下のインスタンスのパス（/ で終わる）。origin は配信元 */
export interface Mount {
  mount: string;
  origin: string;
}

/**
 * 応答の Location を、ブラウザが受け取る値に直す。/ で始まるアプリの中のパスには、置き場所を前に付ける
 * （サブパスに置いたアプリの前で、リバースプロキシが Location を書き換えるのと同じ）。それ以外の値は、書いてあるとおりに返す
 */
export function mountLocation(location: string, { mount, origin }: Mount): string {
  const path = normalizeAppPath(location, origin);
  return path === null ? location : `${mount}${path.slice(1)}`;
}

/**
 * ブラウザが location に従うと、教材アプリの置き場所の外へ出るか。requestPath は、応答を返したリクエストのパス。
 * 読めない値と、http・https 以外のアドレス（javascript: など。ブラウザがリダイレクトの行き先として受け付けない）は、外への移動に数えない
 */
export function leavesMount(location: string, requestPath: string, { mount, origin }: Mount): boolean {
  const base = `${origin}${mount}`;
  const from = `${base}${requestPath.slice(1)}`;
  if (!URL.canParse(location, from)) return false;
  const target = new URL(location, from);
  return /^https?:$/.test(target.protocol) && !target.href.startsWith(base);
}

/** 文書のリンクとフォームが置き場所の下を指すよう、相対アドレスの基準（base）を入れる。本文がない応答はそのまま */
function withBase(html: string, mount: string): string {
  if (html === '') return html;
  if (!html.includes('<head>')) throw new Error('教材アプリの文書に <head> がありません');
  return html.replace('<head>', `<head><base href="${mount}">`);
}

/** 教材アプリの応答を、Service Worker が返す HTTP 応答の中身にする。応答がヘッダと HTML の形でなければ失敗させる */
export function toReply(response: AppResponse, at: Mount): RelayReply {
  const body = response.body;
  if (!isHttpBody(body)) throw new Error('教材アプリの応答が、ヘッダと HTML の形ではありません');
  const { location, ...rest } = body.headers;
  const headers = location === undefined ? rest : { ...rest, location: mountLocation(location, at) };
  return { status: response.status, headers, body: withBase(body.html, at.mount) };
}

/** 基盤の側で作る、エラーの文書（教材アプリが答えられなかったとき）。message は文字として入れる */
export function errorReply(status: number, message: string): RelayReply {
  const text = message.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  return {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${status}</title></head><body><p>${text}</p></body></html>`,
  };
}
