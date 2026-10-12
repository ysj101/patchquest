// メモアプリの画面。隔離 iframe の中で動き、データはすべて ctx.request（Host 経由）で取得する。
// 教材データは textContent でだけ表示する
import type { AppResponse } from '../../platform/contract';
import type { ViewContext } from '../../runtimes/browser/app-module';
import { BODY_MAX_LENGTH, TITLE_MAX_LENGTH } from './model';

type Child = Node | string;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: object = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** 画面内の移動はフレームを遷移させず、アプリ内で描画し直す */
function linkButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', { type: 'button', className: 'link' }, label);
  button.addEventListener('click', onClick);
  return button;
}

function errorMessage(res: AppResponse): string {
  const body = res.body as { error?: unknown } | null;
  return typeof body?.error === 'string' ? body.error : `エラー（${res.status}）`;
}

const alert = (message: string) => el('p', { className: 'error' }, message);

async function header(root: HTMLElement, ctx: ViewContext): Promise<boolean> {
  root.append(el('p', { className: 'badge' }, '学習用の架空サービス'));
  if (!ctx.viewer) {
    root.append(el('h1', {}, 'メモ帳'), el('p', { className: 'muted' }, 'ログインしていません。演習画面で利用者を選んでください。'));
    return false;
  }
  const me = await ctx.request({ method: 'GET', path: '/api/me' });
  const name = me.status === 200 ? (me.body as { user: { name: string } }).user.name : ctx.viewer;
  root.append(el('h1', {}, 'メモ帳'), el('p', { className: 'muted' }, `${name} さんとしてログイン中`));
  return true;
}

async function list(root: HTMLElement, ctx: ViewContext): Promise<void> {
  const res = await ctx.request({ method: 'GET', path: '/api/memos' });
  if (res.status !== 200) return void root.append(alert(errorMessage(res)));
  const memos = (res.body as { memos: { id: number; title: string }[] }).memos;
  root.append(el('div', { className: 'row' }, linkButton('＋ 新しいメモ', () => ctx.navigate('/memos/new'))));
  if (memos.length === 0) return void root.append(el('p', { className: 'muted' }, 'メモはまだありません。'));
  root.append(el('ul', { className: 'memo-list' }, ...memos.map((m) => el('li', {}, linkButton(m.title, () => ctx.navigate(`/memos/${m.id}`))))));
}

async function detail(root: HTMLElement, ctx: ViewContext, id: string): Promise<void> {
  const back = linkButton('← 一覧へ戻る', () => ctx.navigate('/memos'));
  const res = await ctx.request({ method: 'GET', path: `/api/memos/${id}` });
  if (res.status !== 200) return void root.append(back, alert(errorMessage(res)));
  const memo = (res.body as { memo: { id: number; title: string; body: string } }).memo;
  const remove = el('button', { type: 'button' }, '削除');
  remove.addEventListener('click', async () => {
    // sandbox では confirm() が使えないため、2 回押して削除する
    if (remove.dataset.armed !== 'true') {
      remove.dataset.armed = 'true';
      remove.textContent = 'もう一度押すと削除します';
      return;
    }
    const deleted = await ctx.request({ method: 'DELETE', path: `/api/memos/${memo.id}` });
    if (deleted.status === 204) ctx.navigate('/memos');
    else root.append(alert(errorMessage(deleted)));
  });
  root.append(
    back,
    el('article', { className: 'memo' }, el('h2', {}, memo.title), el('p', { className: 'memo-body' }, memo.body)),
    el('div', { className: 'row' }, linkButton('編集', () => ctx.navigate(`/memos/${memo.id}/edit`)), remove),
  );
}

async function form(root: HTMLElement, ctx: ViewContext, id?: string): Promise<void> {
  let initial = { title: '', body: '' };
  if (id) {
    const res = await ctx.request({ method: 'GET', path: `/api/memos/${id}` });
    if (res.status !== 200) return void root.append(alert(errorMessage(res)));
    initial = (res.body as { memo: typeof initial }).memo;
  }
  // 入力欄の文字数制限は画面だけの制限。教材ロジック側でも検証する
  const title = el('input', { name: 'title', value: initial.title, maxLength: TITLE_MAX_LENGTH, required: true });
  const body = el('textarea', { name: 'body', value: initial.body, maxLength: BODY_MAX_LENGTH, rows: 5 });
  const message = el('p', { className: 'error', role: 'alert' });
  // sandbox ではフォーム送信が禁止されているため、submit ではなくボタンのクリックで保存する
  const save = el('button', { type: 'button' }, '保存');
  const formEl = el(
    'div',
    { className: 'stack' },
    el('label', {}, 'タイトル', title),
    el('label', {}, '本文', body),
    el('div', { className: 'row' }, save, linkButton('キャンセル', () => ctx.navigate(id ? `/memos/${id}` : '/memos'))),
    message,
  );
  save.addEventListener('click', async () => {
    const res = await ctx.request({
      method: id ? 'PUT' : 'POST',
      path: id ? `/api/memos/${id}` : '/api/memos',
      body: { title: title.value, body: body.value },
    });
    if (res.status === 200 || res.status === 201) ctx.navigate(`/memos/${(res.body as { memo: { id: number } }).memo.id}`);
    else message.textContent = errorMessage(res);
  });
  root.append(el('h2', {}, id ? 'メモを編集' : '新しいメモ'), formEl);
}

export async function render(root: HTMLElement, route: string, ctx: ViewContext): Promise<void> {
  if (!(await header(root, ctx))) return;
  const [, section, id, action] = route.split('/');
  if (section !== 'memos' || id === undefined) return list(root, ctx);
  if (id === 'new') return form(root, ctx);
  if (action === 'edit') return form(root, ctx, id);
  return detail(root, ctx, id);
}
