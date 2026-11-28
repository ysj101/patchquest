// 掲示板（ページを返す教材アプリ）の教材ロジック。応答の HTML・応答ヘッダ・設定の保存を、Node で確かめる。
// ブラウザがヘッダに従ってスクリプトを止めることは、E2E（missions/csp/__tests__/csp.spec.ts）と出荷前検証で確かめる
import { describe, expect, it } from 'vitest';
import { boardApp } from '../../apps/board';
import { describeEvent, describeExchange, describeRequest } from '../../apps/board/events';
import { ATTACK_COMMENT } from '../../apps/board/fixtures';
import type { ActorKey, AppRequest, ImplementationSelection, PrepareOptions } from '../../platform/contract';
import { runSteps } from '../../platform/evaluator/scenario';
import { VERIFICATION_SEEDS } from '../../platform/orchestrator/pack-verification';
import { AppEngine } from '../../runtimes/browser/engine';
import { escapeHtml, pageDocument, pageLink } from '../../runtimes/browser/pages/document';
import { requestOnly } from '../support/request-only';

const options = (seed: number, implementations: ImplementationSelection = {}): PrepareOptions => ({
  attemptId: `board-${String(seed)}`,
  app: { id: 'board', version: boardApp.descriptor.version },
  fixture: { generator: 'board.default', seed },
  implementations,
});

/** 課題パック（csp）が注入する、ヘッダを付けず、コメントをそのまま HTML に入れる状態 */
const VULNERABLE = { 'board.headers.provision': 'csp/no-policy', 'board.comment.render': 'csp/comment-raw' };
const SETTINGS = '/admin/headers';

async function send(engine: AppEngine, actor: ActorKey, request: AppRequest) {
  const session = (await engine.invoke({ kind: 'session', actor })).session ?? null;
  const { response, events } = await engine.invoke({ kind: 'request', session, request });
  if (!response) throw new Error('応答がありません');
  return { response, events };
}

const save = (engine: AppEngine, value: unknown, actor: ActorKey = 'admin') => send(engine, actor, { method: 'POST', path: SETTINGS, body: { value } as AppRequest['body'] });
const board = (engine: AppEngine, actor: ActorKey = 'alice') => send(engine, actor, { method: 'GET', path: '/board' });

describe.each(VERIFICATION_SEEDS)('掲示板の基準実装（seed %i）', (seed) => {
  it.each(requestOnly(boardApp.tests).map((test) => [test.id, test] as const))('%s', async (_, test) => {
    const engine = new AppEngine();
    const { refs } = await engine.prepare(options(seed));
    const result = await runSteps(test.steps, refs, {
      session: async (actor) => (await engine.invoke({ kind: 'session', actor })).session ?? null,
      request: async (session, request) => {
        const { response, events } = await engine.invoke({ kind: 'request', session, request });
        if (!response) throw new Error('応答がありません');
        return { response, events };
      },
      render: () => Promise.reject(new Error('Node では画面を描画しない')),
    });
    expect(result).toMatchObject({ passed: true });
  });
});

describe('掲示板のページ', () => {
  it('基準の状態では、応答に script-src の CSP が付き、攻撃コメントは文字として HTML に入る', async () => {
    const engine = new AppEngine();
    await engine.prepare(options(1));
    const { response } = await board(engine);
    expect(response.headers).toEqual({ 'content-security-policy': "script-src 'self'" });
    expect(response.body).toContain('&lt;script&gt;pqMarker()&lt;/script&gt;');
    expect(response.body).not.toContain(ATTACK_COMMENT);
  });

  it('課題が注入した状態では、応答にヘッダがなく、攻撃コメントがそのまま HTML に入る', async () => {
    const engine = new AppEngine();
    await engine.prepare(options(1, VULNERABLE));
    const { response } = await board(engine);
    expect(response.headers).toEqual({});
    expect(response.body).toContain(`<div class="body">${ATTACK_COMMENT}</div>`);
  });

  it('ページは、同じ場所から配るスクリプトとスタイルシートを相対パスで読みこみ、文書の中にスクリプトを書かない', async () => {
    const engine = new AppEngine();
    await engine.prepare(options(1));
    const { response } = await board(engine);
    expect(response.body).toContain('<script src="../../page.js" data-app="board"></script>');
    expect(response.body).toContain('<link rel="stylesheet" href="../../board-pages.css">');
    expect(JSON.stringify(response.body).match(/<script/g)).toHaveLength(1);
  });

  it('設定へのリンクは管理者にだけ出て、未ログインでも掲示板は読める', async () => {
    const engine = new AppEngine();
    await engine.prepare(options(1));
    expect((await board(engine, 'admin')).response.body).toContain('<a href="admin/headers">管理：応答ヘッダの設定</a>');
    expect((await board(engine, 'alice')).response.body).not.toContain('admin/headers');
    expect((await board(engine, 'anonymous')).response.body).toContain('ログインしていません');
  });

  it('同じ seed なら同じ初期データになり、seed が違うとコメントが変わる', async () => {
    const engine = new AppEngine();
    const first = await engine.prepare(options(1));
    expect(await engine.prepare(options(1))).toEqual(first);
    expect((await engine.prepare(options(2))).hash).not.toBe(first.hash);
  });

  it('ないページは 404、掲示板への POST も 404 のページを返す', async () => {
    const engine = new AppEngine();
    await engine.prepare(options(1));
    expect((await send(engine, 'alice', { method: 'GET', path: '/nowhere' })).response).toMatchObject({ status: 404, body: expect.stringContaining('/nowhere というページはありません。') as unknown });
    expect((await send(engine, 'alice', { method: 'POST', path: '/board' })).response.status).toBe(404);
  });
});

describe('応答ヘッダの設定', () => {
  it('管理者が保存した値が、掲示板の応答に付く。保存の応答は、設定のページへ戻す 303', async () => {
    const engine = new AppEngine();
    await engine.prepare(options(1, VULNERABLE));
    const saved = await save(engine, "  script-src 'self' 'unsafe-inline' ");
    expect(saved.response).toEqual({ status: 303, headers: { location: SETTINGS }, body: '' });
    expect(saved.events).toEqual([{ type: 'headers.changed', data: { name: 'Content-Security-Policy', value: "script-src 'self' 'unsafe-inline'" } }]);
    expect((await board(engine)).response.headers).toEqual({ 'content-security-policy': "script-src 'self' 'unsafe-inline'" });
    // 設定のページには、いまの値が文字として入る
    const { response } = await send(engine, 'admin', { method: 'GET', path: SETTINGS });
    expect(response.body).toContain('value="script-src &#39;self&#39; &#39;unsafe-inline&#39;"');
    expect(response.headers).toBeUndefined();
  });

  it('空の値を保存すると、ヘッダを付けなくなる', async () => {
    const engine = new AppEngine();
    await engine.prepare(options(1));
    expect((await save(engine, '')).events).toEqual([{ type: 'headers.changed', data: { name: 'Content-Security-Policy', value: null } }]);
    expect((await board(engine)).response.headers).toEqual({});
    expect((await send(engine, 'admin', { method: 'GET', path: SETTINGS })).response.body).toContain('いまの値：（付けていません）');
  });

  it.each([
    ['文字列でない値', 12, '値を入力してください。'],
    ['長すぎる値', 'a'.repeat(301), '値は 300 文字までです。'],
    ['改行を含む値', "script-src 'self'\nx-evil: 1", '値に使えるのは、半角の英数字と記号だけです。'],
    ['全角の文字を含む値', 'スクリプトを止める', '値に使えるのは、半角の英数字と記号だけです。'],
  ])('%s は保存せず、理由を付けて設定のページを返す', async (_, value, reason) => {
    const engine = new AppEngine();
    await engine.prepare(options(1));
    const { response, events } = await save(engine, value);
    expect(response).toMatchObject({ status: 400, body: expect.stringContaining(reason) as unknown });
    expect(events).toEqual([]);
    expect((await board(engine)).response.headers).toEqual({ 'content-security-policy': "script-src 'self'" });
  });

  it('本文のない送信は保存しない', async () => {
    const engine = new AppEngine();
    await engine.prepare(options(1));
    expect((await send(engine, 'admin', { method: 'POST', path: SETTINGS })).response.status).toBe(400);
  });

  it('管理者でない利用者の保存は断り、値は変わらない', async () => {
    const engine = new AppEngine();
    await engine.prepare(options(1));
    expect((await save(engine, '', 'alice')).response).toMatchObject({ status: 403, body: expect.stringContaining('管理者だけが開けます。') as unknown });
    expect((await board(engine)).response.headers).toEqual({ 'content-security-policy': "script-src 'self'" });
  });
});

describe('観測ログの表示', () => {
  it('ページで起きたことを、計測した値のまま示す', () => {
    expect(describeEvent({ type: 'csp.violation', data: { directive: 'script-src-elem', blocked: 'inline' } })).toBe('ブラウザが止めたもの：inline（守った指定：script-src-elem）');
    expect(describeEvent({ type: 'board.counted', data: { count: 4 } })).toBe('ページのスクリプトが数えたコメント：4 件');
    expect(describeEvent({ type: 'headers.changed', data: { name: 'Content-Security-Policy', value: "script-src 'self'" } })).toBe("応答ヘッダの設定：Content-Security-Policy を「script-src 'self'」にした");
    expect(describeEvent({ type: 'headers.changed', data: { name: 'Content-Security-Policy', value: null } })).toBe('応答ヘッダの設定：Content-Security-Policy を外した');
    expect(describeEvent({ type: 'dom.marker', data: {} })).toBeNull();
  });

  it('やり取りを、状態コード・応答ヘッダ・本文に分けて示す', () => {
    const page = { status: 200, headers: { 'content-security-policy': "script-src 'self'" }, body: '<p>本文</p>' };
    expect(describeExchange({ method: 'GET', path: '/board' }, page)).toEqual({
      mark: { ok: true, text: '200' },
      blocks: [
        { title: '応答ヘッダ', text: "Content-Security-Policy: script-src 'self'" },
        { title: '応答の本文（HTML）', text: '<p>本文</p>' },
      ],
    });
    expect(describeExchange({ method: 'POST', path: SETTINGS, body: { value: 'x' } }, { status: 403, body: '' })).toEqual({
      mark: { ok: false, text: '403' },
      blocks: [
        { title: '送った内容', text: '{"value":"x"}' },
        { title: '応答ヘッダ', text: '（アプリが付けたヘッダはありません）' },
      ],
    });
  });

  it('ヘッダの値を保存する送信を、何をどう変えたかで示す', () => {
    expect(describeRequest({ method: 'POST', path: SETTINGS, body: { value: " script-src 'self' " } })).toBe("Content-Security-Policy を「script-src 'self'」にする");
    expect(describeRequest({ method: 'POST', path: SETTINGS, body: { value: '' } })).toBe('Content-Security-Policy を外す');
    expect(describeRequest({ method: 'GET', path: '/board' })).toBeNull();
  });
});

describe('ページの HTML を組み立てる部品', () => {
  it('文字として入れる値の記号を置き換える', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });

  it('ページの深さに合わせて、別のページと静的ファイルへの相対パスを作る', () => {
    expect(pageLink('/board', '/admin/headers')).toBe('admin/headers');
    expect(pageLink('/admin/headers', '/board')).toBe('../board');
    expect(pageLink('/admin/headers?saved=1', '/admin/headers')).toBe('../admin/headers');
    const html = pageDocument({ appId: 'board', route: '/admin/headers', title: '<設定>', stylesheet: 'board-pages.css', body: '<p>本文</p>' });
    expect(html).toContain('<script src="../../../page.js" data-app="board"></script>');
    expect(html).toContain('<title>&lt;設定&gt;</title>');
    expect(html).toContain('<body><p>本文</p></body>');
  });
});
