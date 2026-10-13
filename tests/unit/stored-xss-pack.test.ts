// ミッション2「コメントからのスクリプト実行を防ぐ」（保存型 XSS、Issue #18）。
// Node では画面を描画しないため、描画関数の切り替えと再現の判定をここで確かめ、出荷前検証は E2E で行う
import { describe, expect, it } from 'vitest';
import type { RenderComment } from '../../apps/memo/hooks';
import { storedXssPack } from '../../missions/stored-xss';
import { ATTACK_COMMENT } from '../../missions/stored-xss/tests';
import type { Exchange } from '../../platform/contract';
import { detectReproduction } from '../../platform/evaluator/evaluator';

const { manifest } = storedXssPack;

function element(): HTMLElement & { html: string; text: string } {
  let html = '';
  let text = '';
  return {
    get html() {
      return html;
    },
    get text() {
      return text;
    },
    set innerHTML(value: string) {
      html = value;
    },
    get innerHTML() {
      return html;
    },
    set textContent(value: string) {
      text = value;
    },
    get textContent() {
      return text;
    },
  } as HTMLElement & { html: string; text: string };
}

const render = (id: string) => storedXssPack.implementations[id]?.run as RenderComment;

describe('コメント描画の実装', () => {
  it('注入する実装はコメントを HTML として代入する', () => {
    const el = element();
    render('stored-xss/render-html')(el, { body: ATTACK_COMMENT });
    expect(el.html).toBe(ATTACK_COMMENT);
  });

  it('script タグだけを消しても、画像の onerror は HTML のまま残る', () => {
    const el = element();
    render('stored-xss/strip-script')(el, { body: `<script>pqMarker()</script>${ATTACK_COMMENT}` });
    expect(el.html).toBe(ATTACK_COMMENT);
    expect(el.html).not.toContain('<script');
  });

  it('コメントをすべて表示しない実装は本文を空にする', () => {
    const el = element();
    render('stored-xss/hide-all')(el, { body: '普通のコメント' });
    expect(el.text).toBe('');
    expect(el.html).toBe('');
  });
});

describe('再現の判定', () => {
  const marked = (actor: string, marker: boolean): Exchange => ({
    runId: 'r1',
    actor,
    kind: 'render',
    route: '/pages/1',
    events: marker ? [{ type: 'dom.marker', data: {} }] : [],
  });

  it('共有ページを開いて実行マーカーが出たら、その閲覧者の probe で再現とみなす', () => {
    expect(detectReproduction(marked('alice', true), manifest.probes, {})).toBe('view-as-alice');
    expect(detectReproduction(marked('bob', true), manifest.probes, {})).toBe('view-as-bob');
    expect(detectReproduction(marked('carol', true), manifest.probes, {})).toBe('view-as-carol');
  });

  it('マーカーのない表示や、投稿だけのリクエストは再現にしない', () => {
    expect(detectReproduction(marked('alice', false), manifest.probes, {})).toBeNull();
    const posted: Exchange = {
      runId: 'r1',
      actor: 'bob',
      kind: 'request',
      request: { method: 'POST', path: '/api/pages/1/comments', body: { body: ATTACK_COMMENT } },
      response: { status: 201, body: { comment: { body: ATTACK_COMMENT } } },
      events: [],
    };
    expect(detectReproduction(posted, manifest.probes, {})).toBeNull();
  });
});
