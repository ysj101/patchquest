// ミッション2「コメントからのスクリプト実行を防ぐ」（保存型 XSS、spec §8.2）。
// 共有ページのコメント描画を HTML 解釈へ切り替え、別の利用者が開いたときに検証済みペイロードが実行される事故を題材にする
import type { MissionPack } from '../../platform/contract';
import { IMPLEMENTATIONS } from './implementations';
import { DEBRIEF, HINTS, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { ATTACK_COMMENT, CASES, PLAIN_COMMENT, PROBES, TARGET_CASES } from './tests';

const HOOKS = [{ id: 'comment.render', contract: 1 }];
const TARGET_APP = { appId: 'memo', versions: '^1.3.0' };
const RECIPE = 'render-as-html';
const RENDER_HTML = `const renderComment = (el, comment) => {
  el.innerHTML = comment.body;
};`;

export const storedXssPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'stored-xss',
    version: '1.4.0',
    kind: 'mission',
    title: 'コメントからのスクリプト実行を防ぐ',
    summary:
      '共有ページのコメントが、別の利用者の画面でスクリプトとして動く問い合わせを調べます。危険な HTML 解釈を、文字として表示する描画に戻します。',
    learningObjectives: [
      '検証済みの攻撃コメントを保存し、別の利用者が開いたときに画面で実行されることを再現できる',
      'script タグだけを消すことと、文字として表示することの違いを説明できる',
      '対策のあと、保存済みの攻撃コメントが動かず、日本語・記号・角括弧のコメントは文字のまま読めることを確かめられる',
    ],
    estimatedMinutes: 15,
    vulnerability: { name: '保存型 XSS', fullName: '格納型クロスサイトスクリプティング', cwe: 'CWE-79', category: 'output-encoding' },
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: {
        name: 'carol さん', role: '共有ページの利用者',
        reactions: {
          reproduced: 'コメントを読むだけで動いてしまうんだね。',
          secured: '直してくれてありがとう。コメントを文字として読めるね。',
          closing: '書かれた文字とプログラムを分けて扱うんだね。',
        },
      },
      incident:
        '利用者の carol さんから問い合わせがありました。「共有ページを開いたら、bob さんが書いたコメントのところで、自分では操作していない動きが起きました。コメントに書いたことが、ほかの人の画面でプログラムとして動いているようです」',
      goal: 'コメントは保存された文字列のまま、読んだ人の画面では文字として表示します。スクリプトとしては動かしません。日本語・記号・角括弧を含む普通のコメントは、これまでどおり読めます。',
      protectedAssets: ['共有ページを開いた人の画面（その人の操作としてスクリプトが動いてしまうこと）'],
      normalUse: ['日本語・記号・角括弧を含むコメントが、文字として読める'],
    },
    appCompatibility: TARGET_APP,
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview'] },
    hooks: HOOKS,
    mutationRecipes: [
      {
        id: RECIPE,
        version: '1.0.0',
        appliesTo: { appId: 'memo', versions: '^1.3.0', hooks: [{ id: 'comment.render', contract: 1 }] },
        apply: [{ hook: 'comment.render', implementation: 'stored-xss/render-html' }],
        verify: { probes: ['view-as-alice', 'view-as-bob', 'view-as-carol'] },
        revert: 'baseline',
      },
    ],
    prerequisites: { features: ['comments'] },
    conflicts: [],
    fixtures: { generator: 'memo.default', variants: [{ id: 'shared-page', label: '共有ページ', recipe: RECIPE }] },
    actions: [
      {
        id: 'post-comment',
        label: 'コメントを投稿する',
        description: '共有ページにコメントを保存します。攻撃に使えるのは、隔離の検証で実行できると確認した固定のコメントだけです。自由に JavaScript を書く欄はありません。',
        request: { method: 'POST', path: '/api/pages/{{pages.shared.id}}/comments', body: { body: '{{field.body}}' } },
        fields: [
          {
            name: 'body',
            label: '投稿するコメント',
            input: 'select',
            help: '検証済みの攻撃コメントは、画像の読み込み失敗（onerror）で教材用の実行マーカーを呼びます。普通のコメントは、日本語・記号・角括弧の例です。',
            options: [
              { value: ATTACK_COMMENT, label: '検証済みの攻撃コメント（画像の onerror）' },
              { value: PLAIN_COMMENT, label: '普通のコメント（日本語・記号・角括弧）' },
            ],
          },
        ],
        editable: false,
      },
    ],
    defenses: [
      {
        id: 'text-content',
        label: 'コメントを文字として表示する',
        description: 'コメント本文を textContent で出します。タグもイベント属性も、入力された文字のまま表示され、実行されません。',
        apply: [{ hook: 'comment.render', implementation: 'memo/comment-text' }],
        referenceDiff: {
          file: 'apps/memo/hooks.ts',
          language: 'ts',
          before: RENDER_HTML,
          after: `const renderComment = (el, comment) => {
  el.textContent = comment.body;
};`,
        },
        expected: 'secure',
      },
      {
        id: 'strip-script',
        label: 'script タグだけを削除する',
        description: 'script タグを取り除いてから、残りを HTML として解釈します。ほかのタグやイベント属性はそのままです。',
        apply: [{ hook: 'comment.render', implementation: 'stored-xss/strip-script' }],
        referenceDiff: {
          file: 'apps/memo/hooks.ts',
          language: 'ts',
          before: RENDER_HTML,
          after: `const renderComment = (el, comment) => {
  const withoutScript = comment.body.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script\\s*>/gi, '');
  el.innerHTML = withoutScript;
};`,
        },
        expected: 'insufficient',
      },
      {
        id: 'hide-all',
        label: 'コメントをすべて表示しない',
        description: 'コメント本文を画面に出さないようにします。危険なコメントは動きませんが、普通のコメントも読めなくなります。',
        apply: [{ hook: 'comment.render', implementation: 'stored-xss/hide-all' }],
        referenceDiff: {
          file: 'apps/memo/hooks.ts',
          language: 'ts',
          before: RENDER_HTML,
          after: `const renderComment = (el) => {
  el.textContent = '';
};`,
        },
        expected: 'breaks-normal',
      },
    ],
    probes: PROBES,
    tests: {
      target: ['comment.no-script', ...TARGET_CASES.map((test) => test.id)],
      cases: CASES,
    },
    hints: HINTS,
    solution: SOLUTION,
    transferCheck: TRANSFER_CHECK,
    debrief: DEBRIEF,
  },
  implementations: IMPLEMENTATIONS,
};
