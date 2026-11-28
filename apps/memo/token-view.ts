// メモアプリの「ログイントークン」の画面。トークンを発行し、3 つの部分に分けて中身を読み、中身を書き換えて送れる。
// 中身を読む・書き換えるのに鍵は要らないので、どちらも画面（隔離 iframe）の中だけで行う。署名は教材ロジックだけが計算できる
import type { AppResponse } from '../../platform/contract';
import type { ViewContext } from '../../runtimes/browser/app-module';
import { el, sentenceLines } from '../shared/dom';
import { decodeText, encodeText, joinToken, splitToken, type TokenParts } from './jwt';

interface TokenMemos {
  user: { name: string };
  memos: { title: string; body: string }[];
}

function errorText(res: AppResponse): string {
  const body = res.body as { error?: unknown } | null;
  return typeof body?.error === 'string' ? body.error : `エラー（${res.status}）`;
}

const guide = (text: string) => el('p', { className: 'muted' }, ...sentenceLines(text));

/** トークンを、3 つの部分が見分けられるように色と下線の違う文字で並べる */
function tokenCode(parts: TokenParts): HTMLElement {
  const dot = () => el('span', { className: 'token-dot' }, '.');
  return el(
    'code',
    { className: 'token' },
    el('span', { className: 'token-header' }, parts.header),
    dot(),
    el('span', { className: 'token-payload' }, parts.payload),
    dot(),
    el('span', { className: 'token-signature' }, parts.signature),
  );
}

/** トークンの 1 つの部分。base64url のままの文字と、その説明や元の文字を並べる */
function partBlock(title: string, className: string, raw: HTMLElement, ...detail: (Node | string)[]): HTMLElement {
  raw.classList.add('token', className);
  return el('section', { className: 'token-part' }, el('h4', {}, title), raw, ...detail);
}

function memoResult(body: TokenMemos): HTMLElement[] {
  return [
    el('h3', {}, `${body.user.name} さんのメモ（${body.memos.length} 件）`),
    el('ul', { className: 'memo-list' }, ...body.memos.map((memo) => el('li', {}, el('strong', {}, memo.title), '：', el('span', { className: 'memo-body' }, memo.body)))),
  ];
}

/** 発行されたトークンを調べる欄。中身を書き換えると、送るトークンの 2 つ目の部分だけが変わる */
function workspace(ctx: ViewContext, issued: TokenParts): HTMLElement {
  const payloadRaw = el('code', {}, issued.payload);
  const payloadText = el('textarea', { name: 'payload', rows: 1, spellcheck: false, value: decodeText(issued.payload) ?? '' });
  const outgoing = el('div', {}, tokenCode(issued));
  const status = el('p', { className: 'muted', role: 'status' }, '発行されたトークンのままです。');
  const result = el('div', { className: 'stack', role: 'region', ariaLabel: 'トークンで取り出した結果' });
  const send = el('button', { type: 'button' }, 'このトークンでメモを取り出す');
  let current = issued;

  payloadText.addEventListener('input', () => {
    current = { ...issued, payload: encodeText(payloadText.value) };
    payloadRaw.textContent = current.payload;
    outgoing.replaceChildren(tokenCode(current));
    status.textContent = current.payload === issued.payload ? '発行されたトークンのままです。' : '中身を書き換えました。署名は、発行されたときのままです。';
    result.replaceChildren();
  });
  const fetchMemos = async () => {
    const res = await ctx.request({ method: 'POST', path: '/api/token/memos', body: { token: joinToken(current) } });
    result.replaceChildren(...(res.status === 200 ? memoResult(res.body as unknown as TokenMemos) : [el('p', { className: 'error' }, errorText(res))]));
    // 結果は画面の下のほうに出るので、見えるところまで送る
    result.scrollIntoView({ block: 'nearest' });
  };
  send.addEventListener('click', () => void fetchMemos());

  return el(
    'div',
    { className: 'stack' },
    el('h3', {}, '発行されたトークン'),
    tokenCode(issued),
    el('h3', {}, 'トークンを調べる'),
    guide('トークンは「.」で 3 つに分かれています。前の 2 つは base64url という書き方で、鍵がなくても元の文字に戻せます。この欄は、分けて読むための教材用の道具です。'),
    partBlock('1 つ目：ヘッダー', 'token-header', el('code', {}, issued.header), el('p', {}, '元の文字：', el('code', {}, decodeText(issued.header) ?? '（読めません）'))),
    partBlock('2 つ目：中身', 'token-payload', payloadRaw, el('label', {}, '元の文字（書き換えられます）', payloadText)),
    partBlock(
      '3 つ目：署名',
      'token-signature',
      el('code', {}, issued.signature),
      guide('サーバだけが知っている鍵で、ヘッダーと中身から計算した値です。鍵がないと、同じ値は作れません。'),
    ),
    el('h3', {}, '送るトークン'),
    outgoing,
    status,
    el('div', { className: 'row' }, send),
    result,
  );
}

export function tokenView(root: HTMLElement, ctx: ViewContext): void {
  const issue = el('button', { type: 'button' }, 'トークンを発行する');
  const message = el('p', { className: 'error', role: 'alert' });
  const slot = el('div', {});
  const issueToken = async () => {
    const res = await ctx.request({ method: 'POST', path: '/api/token' });
    const parts = res.status === 201 ? splitToken((res.body as { token: string }).token) : null;
    message.textContent = parts ? '' : errorText(res);
    slot.replaceChildren(...(parts ? [workspace(ctx, parts)] : []));
    // 発行したトークンと、その下の調べる欄が見えるところまで送る
    if (parts) slot.scrollIntoView({ block: 'start' });
  };
  issue.addEventListener('click', () => void issueToken());
  root.append(
    el('h2', {}, 'ログイントークン'),
    guide('別のアプリからメモを取り出すときに、パスワードの代わりに送るものです。トークンを送ると、トークンに書かれた利用者のメモが返ります。'),
    el('div', { className: 'row' }, issue),
    message,
    slot,
  );
}
