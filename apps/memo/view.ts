// メモアプリの画面。隔離 iframe の中で動き、データはすべて ctx.request（Host 経由）で取得する。
// 教材データは textContent でだけ表示する
import type { AppResponse } from '../../platform/contract';
import type { ViewContext } from '../../runtimes/browser/app-module';
import { el } from '../shared/dom';
import type { RenderComment } from './hooks';
import { BODY_MAX_LENGTH, COMMENT_MAX_LENGTH, QUERY_MAX_LENGTH, TITLE_MAX_LENGTH } from './model';

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
  root.append(
    el('h1', {}, 'メモ帳'),
    el('p', { className: 'muted' }, `${name} さんとしてログイン中`),
    el(
      'nav',
      { className: 'row', ariaLabel: 'アプリ内の移動' },
      linkButton('メモ', () => ctx.navigate('/memos')),
      linkButton('共有ページ', () => ctx.navigate('/pages')),
      linkButton('検索', () => ctx.navigate('/search')),
    ),
  );
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

async function pageList(root: HTMLElement, ctx: ViewContext): Promise<void> {
  const res = await ctx.request({ method: 'GET', path: '/api/pages' });
  if (res.status !== 200) return void root.append(alert(errorMessage(res)));
  const pages = (res.body as { pages: { id: number; title: string }[] }).pages;
  root.append(el('h2', {}, '共有ページ'), el('ul', {}, ...pages.map((p) => el('li', {}, linkButton(p.title, () => ctx.navigate(`/pages/${p.id}`))))));
}

async function page(root: HTMLElement, ctx: ViewContext, id: string): Promise<void> {
  const res = await ctx.request({ method: 'GET', path: `/api/pages/${id}` });
  if (res.status !== 200) return void root.append(alert(errorMessage(res)));
  const { page: p, comments } = res.body as {
    page: { title: string; body: string };
    comments: { id: number; authorName: string; body: string }[];
  };
  const renderComment = ctx.hook<RenderComment>('comment.render');
  const items = comments.map((c) => {
    const body = el('span', { className: 'comment-body' });
    renderComment(body, { body: c.body });
    return el('li', { className: 'comment' }, el('strong', {}, c.authorName), body);
  });
  const input = el('textarea', { name: 'comment', maxLength: COMMENT_MAX_LENGTH, rows: 3 });
  const message = el('p', { className: 'error', role: 'alert' });
  const post = el('button', { type: 'button' }, 'コメントする');
  post.addEventListener('click', async () => {
    const created = await ctx.request({ method: 'POST', path: `/api/pages/${id}/comments`, body: { body: input.value } });
    if (created.status === 201) ctx.navigate(`/pages/${id}`);
    else message.textContent = errorMessage(created);
  });
  root.append(
    el('article', { className: 'memo' }, el('h2', {}, p.title), el('p', { className: 'memo-body' }, p.body)),
    el('h3', {}, `コメント（${comments.length} 件）`),
    el('ul', { className: 'comments' }, ...items),
    el('label', {}, 'コメントを書く', input),
    el('div', { className: 'row' }, post),
    message,
  );
}

async function searchView(root: HTMLElement, ctx: ViewContext, initial: string): Promise<void> {
  const input = el('input', { type: 'search', name: 'q', value: initial, maxLength: QUERY_MAX_LENGTH });
  const run = el('button', { type: 'button' }, '検索する');
  const results = el('div', { className: 'stack' });
  const search = async () => {
    results.replaceChildren();
    const res = await ctx.request({ method: 'GET', path: `/api/search?q=${encodeURIComponent(input.value)}` });
    if (res.status !== 200) return void results.append(alert(errorMessage(res)));
    const rows = (res.body as { results: { id: number; title: string }[] }).results;
    results.append(
      rows.length === 0
        ? el('p', { className: 'muted' }, '該当するメモはありません。')
        : el('ul', {}, ...rows.map((r) => el('li', {}, linkButton(r.title, () => ctx.navigate(`/memos/${r.id}`))))),
    );
  };
  run.addEventListener('click', () => void search());
  input.addEventListener('keydown', (e) => e.key === 'Enter' && void search());
  root.append(el('h2', {}, '自分のメモを検索'), el('div', { className: 'row' }, el('label', {}, '検索語', input), run), results);
  if (initial) await search();
}

export async function render(root: HTMLElement, route: string, ctx: ViewContext): Promise<void> {
  if (!(await header(root, ctx))) return;
  const [path, query] = route.split('?');
  const [, section, id, action] = path!.split('/');
  if (section === 'pages') return id === undefined ? pageList(root, ctx) : page(root, ctx, id);
  if (section === 'search') return searchView(root, ctx, new URLSearchParams(query ?? '').get('q') ?? '');
  if (section !== 'memos' || id === undefined) return list(root, ctx);
  if (id === 'new') return form(root, ctx);
  if (action === 'edit') return form(root, ctx, id);
  return detail(root, ctx, id);
}
