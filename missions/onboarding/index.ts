// オンボーディング（練習用）の課題パック。メモのタイトルの文字数制限が保存処理で効いていない不具合を題材に、
// 「こわす → なおす → たしかめる → ふりかえる」を 3 分で一周する。セキュリティの前提知識がなくても進められる題材にしている
import type { MissionPack } from '../../platform/contract';
import type { PrepareTitleInput, ValidateTitle } from '../../apps/memo/hooks';

const HOOKS = [
  { id: 'memo.title.validate', contract: 1 },
  { id: 'memo.title.input', contract: 1 },
];
const LONG_TITLE = 'あ'.repeat(41);
const TITLE_AT_LIMIT = 'い'.repeat(40);
/** 応答の memo.title が上限（40 文字）を超えている */
const SAVED_LONG_TITLE = [{ path: 'memo.title', is: { minLength: 41 } }];
/** 注入した状態の、保存時のタイトル検証（参考差分の変更前） */
const NO_TITLE_CHECK = 'const validateTitle = (title) => ({ ok: true });';
/** 練習で最初に送るタイトル（49 文字） */
const SAMPLE_LONG_TITLE = '週末の買い物：牛乳、卵、食パン、バター、りんご、バナナ、にんじん、たまねぎ、じゃがいも、ヨーグルト';

export const onboardingPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'onboarding',
    version: '1.4.0',
    kind: 'tutorial',
    title: '練習：はじめての修正',
    summary: 'わざと壊したメモアプリで「こわす → なおす → たしかめる」を一周します。操作ガイドつきで、前提知識は要りません。',
    learningObjectives: ['不具合を自分の操作で起こしてみる', '直し方を選び、自動テストで確かめる', 'なぜ起きたかをふりかえる'],
    estimatedMinutes: 3,
    story: {
      requester: {
        name: 'サポート担当', role: 'メモアプリのサポート',
        reactions: {
          reproduced: '長すぎるタイトルが保存されてしまったね。',
          secured: '直してくれてありがとう。文字数の決まりを守れるね。',
          closing: '短いタイトルは今までどおり使えるね。',
        },
      },
      incident: 'メモのタイトルは 40 文字までの決まりなのに、もっと長いタイトルでも保存できてしまう、という報告がありました。',
      goal: '40 文字を超えるタイトルは保存されないようにします。40 文字までなら、これまでどおり保存できるようにします。',
      protectedAssets: ['タイトルは 40 文字までという決まり'],
      normalUse: ['40 文字までのタイトルでメモを保存できる'],
    },
    appCompatibility: { appId: 'memo', versions: '^1.1.0' },
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview'] },
    prerequisites: { features: ['memo'] },
    hooks: HOOKS,
    conflicts: [],
    fixtures: { generator: 'memo.default', variants: [{ id: 'default', label: '標準', recipe: 'no-title-limit' }] },
    mutationRecipes: [
      {
        id: 'no-title-limit',
        version: '1.0.0',
        appliesTo: { appId: 'memo', versions: '^1.1.0', hooks: HOOKS },
        apply: [
          { hook: 'memo.title.validate', implementation: 'onboarding/accept-any-title' },
          { hook: 'memo.title.input', implementation: 'onboarding/title-input-unlimited' },
        ],
        verify: { probes: ['save-long-title'] },
        revert: 'baseline',
      },
    ],
    actions: [
      {
        id: 'create-memo',
        label: '長いタイトルのメモを保存する',
        description: 'タイトルが 40 文字を超えるメモを保存してみます。',
        request: { method: 'POST', path: '/api/memos', body: { title: '{{field.title}}', body: '{{field.body}}' } },
        fields: [
          { name: 'title', label: 'タイトル（49 文字）', input: 'text', default: SAMPLE_LONG_TITLE },
          { name: 'body', label: '本文', input: 'textarea', default: '忘れずに買う' },
        ],
        editable: true,
      },
    ],
    defenses: [
      {
        id: 'input-only',
        label: '入力欄で 41 文字目を打てなくする',
        description: '画面のタイトル入力欄に上限を付けます。',
        apply: [{ hook: 'memo.title.input', implementation: 'memo/title-input-max-length' }],
        referenceDiff: {
          file: 'apps/memo/view.ts',
          language: 'ts',
          before: 'const prepareTitleInput = (input) => {};',
          after: 'const prepareTitleInput = (input) => {\n  input.maxLength = 40;\n};',
        },
        whyItFails: '入力欄の上限は画面にしか効かず、画面を通さずに送ると長いタイトルのまま保存できました。',
        expected: 'insufficient',
      },
      {
        id: 'reject-all',
        label: 'メモの保存をすべて止める',
        description: '長いタイトルだけでなく、どんなメモも保存できなくします。',
        apply: [{ hook: 'memo.title.validate', implementation: 'onboarding/reject-all-titles' }],
        referenceDiff: {
          file: 'apps/memo/hooks.ts',
          language: 'ts',
          before: NO_TITLE_CHECK,
          after: "const validateTitle = (title) => ({ ok: false, message: 'メモは保存できません' });",
        },
        whyItFails: '長いタイトルは止まりましたが、普通のメモも保存できなくなりました。',
        expected: 'breaks-normal',
      },
      {
        id: 'validate-on-save',
        label: '保存するときに文字数を確かめる',
        description: 'メモを保存する処理で 40 文字を超えていないか確かめ、超えていたら断ります。',
        apply: [{ hook: 'memo.title.validate', implementation: 'memo/title-max-length' }],
        referenceDiff: {
          file: 'apps/memo/hooks.ts',
          language: 'ts',
          before: NO_TITLE_CHECK,
          after:
            "const validateTitle = (title) =>\n  [...title].length > 40\n    ? { ok: false, message: 'タイトルは 40 文字以内にしてください' }\n    : { ok: true };",
        },
        expected: 'secure',
      },
    ],
    probes: [
      {
        id: 'save-long-title',
        title: '41 文字のタイトルでメモを保存できる',
        steps: [
          {
            kind: 'request',
            as: 'alice',
            request: { method: 'POST', path: '/api/memos', body: { title: LONG_TITLE, body: '長いタイトルの確認' } },
            expect: { status: 201, body: SAVED_LONG_TITLE },
          },
        ],
        // 作成でも編集でも、上限を超えるタイトルで保存できたら再現とみなす
        detect: { response: { status: [200, 201], body: SAVED_LONG_TITLE } },
      },
    ],
    tests: {
      target: ['memo.write.title-length', 'onboarding.update-title-length'],
      cases: [
        {
          id: 'onboarding.title-at-limit',
          category: 'normal',
          title: '40 文字ちょうどのタイトルは保存できる',
          steps: [
            {
              kind: 'request',
              as: 'alice',
              request: { method: 'POST', path: '/api/memos', body: { title: TITLE_AT_LIMIT, body: '上限ちょうど' } },
              expect: { status: 201, body: [{ path: 'memo.title', is: { equals: TITLE_AT_LIMIT } }] },
            },
          ],
        },
        {
          id: 'onboarding.update-title-length',
          category: 'security',
          title: '編集でも上限を超えるタイトルは保存されない',
          steps: [
            {
              kind: 'request',
              as: 'alice',
              request: { method: 'PUT', path: '/api/memos/{{memos.alice.private.id}}', body: { title: LONG_TITLE, body: '編集' } },
              expect: { status: 400, body: [{ path: 'field', is: { equals: 'title' } }] },
            },
          ],
        },
      ],
    },
    hints: [
      { level: 1, text: '40 文字の決まりは、画面の入力欄と、メモを保存する処理のどちらで守るべきでしょうか。' },
      { level: 2, text: '画面を通さずに直接送られた呼び出しでも、決まりが守られるかが分かれ目です。' },
      { level: 3, text: '「保存するときに文字数を確かめる」を選びます。入力欄の上限は、直接の呼び出しには効きません。' },
    ],
    solution:
      '「保存するときに文字数を確かめる」を適用します。保存する処理で確かめれば、画面を通さない呼び出しにも決まりが効きます。入力欄の上限だけでは直接の呼び出しを防げず、保存をすべて止めると普段の使い方まで壊れます。',
    transferCheck: [
      {
        id: 'comment-length',
        situation: 'コメントにも「500 文字まで」の決まりがあり、入力欄には上限が付いています。',
        prompt: 'この決まりを確実に守るには、どうしますか？',
        choices: [
          { id: 'save', label: 'コメントを保存するときに文字数を確かめる', correct: true, explanation: 'そのとおり。保存するときに確かめれば、どこから送られても決まりが守られます。' },
          { id: 'input', label: '入力欄の上限をもっと小さくする', correct: false, explanation: '入力欄の上限は、画面を通さない呼び出しには効きません。' },
        ],
      },
    ],
    debrief: {
      cause: '40 文字の決まりを、保存する処理で確かめていなかったことが原因です。画面を通さずに送れば、長いタイトルでも保存できました。',
      defenseRationale: '決まりは保存する処理で確かめます。入力欄の上限は、入力しやすくするための補助です。',
      takeaways: ['決まりは保存する処理で確かめる', '直したら、攻撃を防げたかと、普段の使い方が壊れていないかの両方を確かめる'],
    },
    guide: [
      {
        id: 'start',
        title: '準備ができたら始めよう',
        body: 'わざと壊したメモアプリを用意しています。「演習を始める」を押してください。',
        anchor: 'preflight',
        until: 'started',
        praise: '準備 OK！',
      },
      {
        id: 'briefing',
        title: '何が起きたか読んでみよう',
        body: '事件と依頼を読んで、「ミッション開始」を押してください。Esc キーでも始められます。',
        anchor: 'briefing',
        until: 'briefed',
        praise: '今回の依頼を確認できました！',
      },
      {
        id: 'break',
        title: 'こわしてみよう',
        body: '「調査」を開き、40 文字を超えるタイトルのまま「送る」を押してみましょう。',
        anchor: 'actions',
        until: 'reproduced',
        praise: '保存できてしまいました。これが今回の不具合です',
      },
      {
        id: 'fix',
        title: 'なおし方を選ぼう',
        body: '「対策」を開き、正しそうな直し方を 1 つ選んで「この対策を適用する」を押します。',
        anchor: 'defense-panel',
        until: 'defense-applied',
        praise: '対策を入れました',
      },
      {
        id: 'check',
        title: 'たしかめよう',
        body: '「攻撃と普段の使い方を検証する」を押すと、自動テストが合否を判定します。',
        anchor: 'verify',
        until: 'verify-passed',
        praise: '合格！ 攻撃を防げました',
        retry: { when: 'verify-failed', text: 'おしい！ 結果を見て、別の対策を選び直してからもう一度検証しよう。' },
      },
      {
        id: 'review',
        title: 'ふりかえろう',
        body: '「振り返り」を開き、原因を読んで最後の 1 問に答えましょう。',
        anchor: 'debrief',
        until: 'understood',
        praise: '練習クリア！',
      },
    ],
  },
  implementations: {
    'onboarding/accept-any-title': { hook: 'memo.title.validate', run: (() => ({ ok: true })) satisfies ValidateTitle },
    'onboarding/reject-all-titles': { hook: 'memo.title.validate', run: (() => ({ ok: false, message: 'メモは保存できません' })) satisfies ValidateTitle },
    'onboarding/title-input-unlimited': { hook: 'memo.title.input', run: (() => {}) satisfies PrepareTitleInput },
  },
};
