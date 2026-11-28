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
    version: '1.11.0',
    kind: 'mission',
    release: 'stable',
    title: 'コメントが勝手に動くのを防ぐ',
    summary:
      '共有ページのコメントが、ほかの人の画面でプログラムとして動いてしまう問い合わせを調べます。コメントを、ただの文字として表示するように直します。',
    learningObjectives: [
      '用意された攻撃コメントを保存し、別の利用者が開いたときに画面で動くことを再現できる',
      '「script タグだけを消す」と「文字として表示する」の違いを説明できる',
      '対策のあと、保存済みの攻撃コメントが動かず、ふつうのコメントは文字のまま読めると確かめられる',
    ],
    estimatedMinutes: 15,
    vulnerability: { name: '保存型 XSS', plain: 'コメントに仕込んだ命令が、ほかの人の画面で勝手に動いてしまう問題', fullName: '格納型クロスサイトスクリプティング', cwe: 'CWE-79', category: 'output-encoding' },
    difficulty: 'intermediate',
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: { name: 'carol さん', role: '共有ページの利用者' },
      incident:
        '利用者の carol さんから問い合わせがありました。「共有ページを開いたら、bob さんのコメントのところで、何もしていないのに勝手な動きが起きました。コメントに書いたことが、ほかの人の画面でプログラムとして動いているようです」',
      goal: 'コメントは、読んだ人の画面で文字として表示します。プログラムとしては動かしません。日本語・記号・角括弧を含むふつうのコメントは、今までどおり読めます。',
      protectedAssets: ['共有ページを開いた人の画面（その人になりすましてスクリプトが動いてしまうこと）'],
      normalUse: ['日本語・記号・角括弧を含むコメントが、文字として読める'],
    },
    appCompatibility: TARGET_APP,
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview'] },
    hooks: HOOKS,
    mutationRecipes: [
      {
        id: RECIPE,
        version: '1.0.0',
        appliesTo: { ...TARGET_APP, hooks: HOOKS },
        apply: [{ hook: 'comment.render', implementation: 'stored-xss/render-html' }],
        verify: { probes: PROBES.map((probe) => probe.id) },
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
        description: '共有ページにコメントを保存します。攻撃に使えるのは、あらかじめ用意したコメントだけです。JavaScript を自由に書く欄はありません。',
        request: { method: 'POST', path: '/api/pages/{{pages.shared.id}}/comments', body: { body: '{{field.body}}' } },
        fields: [
          {
            name: 'body',
            label: '投稿するコメント',
            input: 'select',
            help: '攻撃コメントは、画像の読み込み失敗（onerror）を使って、教材用の実行マーカーを呼びます。ふつうのコメントは、日本語・記号・角括弧の例です。',
            options: [
              { value: ATTACK_COMMENT, label: '攻撃コメント（画像の onerror）' },
              { value: PLAIN_COMMENT, label: 'ふつうのコメント（日本語・記号・角括弧）' },
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
        description: 'コメントを textContent で出します。タグも属性も、書かれた文字のまま表示され、動きません。',
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
        description: 'script タグを取り除いてから、残りを HTML として読みます。ほかのタグや属性はそのままです。',
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
        whyItFails: 'script タグ以外の書き方は残り、画像の onerror が共有ページで動きました。',
        expected: 'insufficient',
      },
      {
        id: 'hide-all',
        label: 'コメントをすべて表示しない',
        description: 'コメントを画面に出さないようにします。危険なコメントは動きませんが、ふつうのコメントも読めなくなります。',
        apply: [{ hook: 'comment.render', implementation: 'stored-xss/hide-all' }],
        referenceDiff: {
          file: 'apps/memo/hooks.ts',
          language: 'ts',
          before: RENDER_HTML,
          after: `const renderComment = (el) => {
  el.textContent = '';
};`,
        },
        whyItFails: 'コメントを出さないようにしたので、ふつうのコメントも読めなくなりました。',
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
