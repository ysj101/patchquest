// 社内ポータルの基準実装（状態 S）が共通テストをすべて通すこと（spec A01）と、行き先の判断・観測ログの表示・画面の HTML
import { describe, expect, it } from 'vitest';
import { portalApp } from '../../apps/portal';
import { describeEvent, describeExchange } from '../../apps/portal/events';
import { isExternal, redirectSameSite, withinSite } from '../../apps/portal/hooks';
import { esc, sentenceHtml } from '../../apps/shared/html';
import type { PrepareOptions } from '../../platform/contract';
import { VERIFICATION_SEEDS } from '../../platform/orchestrator/pack-verification';
import { AppEngine } from '../../runtimes/browser/engine';
import { isHttpBody } from '../../runtimes/browser/http/mount';
import { nodeEvaluator } from '../support/engine-runtime';

const options = (seed: number): PrepareOptions => ({
  attemptId: `portal-${seed}`,
  app: { id: 'portal', version: portalApp.descriptor.version },
  fixture: { generator: 'portal.default', seed },
  implementations: {},
});

describe('社内ポータルの基準実装', () => {
  it.each(VERIFICATION_SEEDS)('seed %i で、共通テストをすべて通す', async (seed) => {
    const evaluator = nodeEvaluator();
    const report = await evaluator.runSuite(options(seed), portalApp.tests, [], `portal-${seed}`, '');
    await evaluator.dispose();
    expect(report.outcomes.filter((outcome) => !outcome.passed).map((outcome) => `${outcome.testId}：${outcome.actual}`)).toEqual([]);
    expect(report.outcomes).toHaveLength(portalApp.tests.length);
  });
});

describe('初期データ', () => {
  it('同じ seed なら同じ、違う seed ならお知らせの番号が変わる', async () => {
    const engine = new AppEngine();
    const first = await engine.prepare(options(1));
    const again = await engine.prepare(options(1));
    const other = await engine.prepare(options(2));
    expect(again).toEqual(first);
    expect(other.refs['notices.first.id']).not.toBe(first.refs['notices.first.id']);
  });
});

describe('応答の形', () => {
  it('どのリクエストにも、ヘッダと HTML の応答を返す（GET・POST 以外や、ないアドレスにも）', async () => {
    const engine = new AppEngine();
    await engine.prepare(options(1));
    const session = (await engine.invoke({ kind: 'session', actor: 'bob' })).session ?? null;
    for (const request of [
      { method: 'GET', path: '/' },
      { method: 'GET', path: '/login' },
      { method: 'PUT', path: '/login' },
      { method: 'DELETE', path: '/nowhere' },
      { method: 'POST', path: '/nowhere' },
      { method: 'GET', path: '/notices/abc' },
    ] as const) {
      const { response } = await engine.invoke({ kind: 'request', session, request });
      expect(isHttpBody(response?.body), `${request.method} ${request.path}`).toBe(true);
    }
  });

  it('利用者を選んでいないときのサインインの画面は、フォームを出さずに選び方を案内する', async () => {
    const engine = new AppEngine();
    await engine.prepare(options(1));
    const { response } = await engine.invoke({ kind: 'request', session: null, request: { method: 'GET', path: '/login?next=%2F' } });
    expect(response).toMatchObject({ status: 200, body: { html: expect.stringContaining('「表示する利用者」で、利用者を選んでください。') as string } });
    expect(JSON.stringify(response?.body)).not.toContain('<form');
  });

  it('サインインの画面は、渡された行き先を文字としてフォームに入れる（タグとして働かない）', async () => {
    const engine = new AppEngine();
    await engine.prepare(options(1));
    const session = (await engine.invoke({ kind: 'session', actor: 'bob' })).session ?? null;
    const { response } = await engine.invoke({ kind: 'request', session, request: { method: 'GET', path: `/login?next=${encodeURIComponent('"><b>x</b>')}` } });
    expect(response).toMatchObject({ body: { html: expect.stringContaining('value="&quot;&gt;&lt;b&gt;x&lt;/b&gt;"') as string } });
  });
});

describe('行き先の判断', () => {
  it('ブラウザと同じ読み方で、このサイトの外への行き先を見分ける', () => {
    expect(['https://evil.example/login', '//evil.example/login', '/\\evil.example/login', 'https://portal.example.attacker.example/'].map(isExternal)).toEqual([true, true, true, true]);
    expect(['/', '/notices/3?from=mail', 'notices/3', 'https://portal.example/notices/3', 'https://[', 'javascript:alert(1)'].map(isExternal)).toEqual([false, false, false, false, false, false]);
  });

  it('基準実装は、このサイトの中の行き先にだけ従い、外のサイト・読めない値・値なしはトップへ送る', () => {
    expect(['/notices/3', 'https://portal.example/notices/3'].map(redirectSameSite)).toEqual(['/notices/3', 'https://portal.example/notices/3']);
    expect(['https://evil.example/login', '//evil.example/login', '/\\evil.example/login', 'javascript:alert(1)', 'https://[', null].map(redirectSameSite)).toEqual(['/', '/', '/', '/', '/', '/']);
  });

  it('このサイトの中の行き先はパスだけの形にし、外の行き先と読めない値はそのまま返す', () => {
    expect(['https://portal.example/notices/3?x=1', '/a/../b', 'https://evil.example/login', 'https://['].map(withinSite)).toEqual(['/notices/3?x=1', '/b', 'https://evil.example/login', 'https://[']);
  });
});

describe('観測ログの表示', () => {
  it('リダイレクトは、行き先と、このサイトの中か外かを示す', () => {
    expect(describeEvent({ type: 'portal.redirect', data: { location: 'https://evil.example/login', external: true } })).toBe('リダイレクト：行き先 https://evil.example/login（このサイトの外）');
    expect(describeEvent({ type: 'portal.redirect', data: { location: '/notices/3', external: false } })).toBe('リダイレクト：行き先 /notices/3（このサイトの中）');
    expect(describeEvent({ type: 'portal.redirect', data: {} })).toBeNull();
    expect(describeEvent({ type: 'app.error', data: { message: 'x' } })).toBeNull();
  });

  it('やり取りは、リクエスト・応答のステータスとヘッダ・本文に分けて示す', () => {
    expect(describeExchange({ method: 'POST', path: '/login', body: { next: '/notices/3', count: 2 } }, { status: 302, body: { headers: { location: '/notices/3', 'content-type': 'text/html' }, html: '' } })).toEqual({
      mark: { ok: true, text: '302' },
      blocks: [
        { title: 'リクエスト', text: 'POST /login\n\nnext=/notices/3\ncount=2' },
        { title: '応答（ステータス 302）のヘッダ', text: 'Location: /notices/3\nContent-Type: text/html' },
      ],
    });
    expect(describeExchange({ method: 'GET', path: '/nowhere' }, { status: 404, body: { headers: {}, html: '<p>ない</p>' } })).toEqual({
      mark: { ok: false, text: '404' },
      blocks: [
        { title: 'リクエスト', text: 'GET /nowhere' },
        { title: '応答（ステータス 404）のヘッダ', text: '' },
        { title: '応答の本文（HTML）', text: '<p>ない</p>' },
      ],
    });
  });

  it('HTTP 応答の形でないやり取りは説明しない（基盤の表示に任せる）', () => {
    expect(describeExchange({ method: 'GET', path: '/' }, { status: 500, body: { error: 'boom' } })).toBeNull();
  });
});

describe('サーバが描く画面の補助', () => {
  it('値は文字として入れ、案内文は句点ごとに改行する', () => {
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    expect(sentenceHtml('1 つめ。<2 つめ>。')).toBe('1 つめ。<br>&lt;2 つめ&gt;。');
  });
});
