// オンボーディング（練習用）の課題パック。メモのタイトルの文字数制限が保存処理で効いていない事故を題材に、
// 再現・対策・検証・振り返りの操作をひと通り練習する。セキュリティの前提知識がなくても進められる題材にしている
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

export const onboardingPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'onboarding',
    version: '1.0.0',
    kind: 'tutorial',
    title: '練習：長すぎるメモのタイトル',
    summary: 'メモのタイトルの文字数制限が効いていない事故を題材に、再現・対策・検証・振り返りの操作をひと通り試します。セキュリティの前提知識は要りません。',
    learningObjectives: [
      '利用者を切り替えて、教材アプリの画面を確かめられる',
      'リクエストを編集して送り、事故を自分の操作で再現できる',
      '対策を選んで検証し、結果から次の手を考えられる',
      '振り返り・初期状態へ戻す・進捗の書き出しを使える',
    ],
    estimatedMinutes: 8,
    story: {
      incident:
        '利用者から問い合わせがありました。「メモのタイトルは 40 文字までと聞いていましたが、それより長いタイトルでも保存できてしまいました。一覧の表示も崩れています」',
      goal: 'タイトルが 40 文字を超えるメモは保存されないようにします。40 文字までのタイトルなら、これまでどおりメモを作成・編集できるようにします。',
      protectedAssets: ['タイトルは 40 文字までという決まり', 'メモ一覧の見やすさ'],
      normalUse: ['40 文字までのタイトルでメモを作成・編集できる', '日本語や記号を含むタイトルも保存できる'],
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
        label: 'メモを作成する',
        description: 'タイトルと本文を入れて、メモを作成する呼び出し（POST /api/memos）を送ります。',
        request: { method: 'POST', path: '/api/memos', body: { title: '{{field.title}}', body: '{{field.body}}' } },
        fields: [
          { name: 'title', label: 'タイトル', input: 'text', default: '買い物リスト' },
          { name: 'body', label: '本文', input: 'textarea', default: '牛乳と卵' },
        ],
        editable: true,
      },
    ],
    defenses: [
      {
        id: 'input-only',
        label: '入力欄だけで文字数を制限する',
        description: '作成・編集画面のタイトル入力欄に上限（maxlength）を付け、40 文字より多く入力できないようにします。',
        apply: [{ hook: 'memo.title.input', implementation: 'memo/title-input-max-length' }],
        referenceDiff: {
          file: 'apps/memo/view.ts',
          language: 'ts',
          before: 'const prepareTitleInput = (input) => {};',
          after: 'const prepareTitleInput = (input) => {\n  input.maxLength = 40;\n};',
        },
        expected: 'insufficient',
      },
      {
        id: 'reject-all',
        label: 'メモの保存をすべて断る',
        description: '長いタイトルが保存されないよう、タイトルの内容にかかわらず保存を断ります。',
        apply: [{ hook: 'memo.title.validate', implementation: 'onboarding/reject-all-titles' }],
        referenceDiff: {
          file: 'apps/memo/hooks.ts',
          language: 'ts',
          before: NO_TITLE_CHECK,
          after: "const validateTitle = (title) => ({ ok: false, message: 'メモは保存できません' });",
        },
        expected: 'breaks-normal',
      },
      {
        id: 'validate-on-save',
        label: '保存処理でタイトルの長さを検証する',
        description: 'メモを保存する処理で、タイトルが 40 文字以内かを確かめます。超えていれば保存せず、400 で理由を返します。',
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
      { level: 1, text: 'タイトルの上限（40 文字）は、どこで確かめるべきでしょうか。画面の入力欄と、メモを保存する処理の 2 か所を考えてみましょう。' },
      {
        level: 2,
        text: '「調査」タブで、タイトルを 41 文字以上にしたリクエストを送ってみましょう。応答が 201 なら保存されています。画面を通さない呼び出しでも上限が守られるかが分かれ目です。',
      },
      { level: 3, text: 'メモを保存する処理でタイトルの文字数を数え、40 文字を超えたら保存せずに断ります。入力欄の上限は入力しやすくするためのもので、それだけでは守れません。' },
    ],
    solution:
      '「保存処理でタイトルの長さを検証する」を適用します。メモを保存する処理でタイトルの文字数を数え、40 文字を超えていれば 400 を返して保存しません。入力欄の上限は、リクエストを直接送れば通らずに済むため、それだけでは防げません。すべての保存を断ると長いタイトルは防げますが、普段のメモの作成もできなくなります。',
    transferCheck: [
      {
        id: 'comment-length',
        situation: '共有ページのコメントには「500 文字まで」という決まりがあり、コメントの入力欄には上限（maxlength）が付いています。',
        prompt: 'この決まりを確実に守らせるには、どうすればよいでしょうか。',
        choices: [
          { id: 'save', label: 'コメントを保存する処理で文字数を確かめる', correct: true, explanation: '保存する処理で確かめれば、画面を通さない呼び出しにも決まりが効きます。' },
          { id: 'input', label: '入力欄の上限をもっと小さくする', correct: false, explanation: '入力欄の上限は、リクエストを直接送れば通らずに済みます。' },
          { id: 'hide', label: 'コメント欄を画面から隠す', correct: false, explanation: '画面から隠しても呼び出しは送れます。普段のコメントもできなくなります。' },
        ],
      },
    ],
    debrief: {
      cause: 'タイトルの文字数を画面の入力欄だけで制限し、メモを保存する処理では確かめていなかったことです。画面を通さずにリクエストを送れば、上限を超えるタイトルでも保存できました。',
      defenseRationale: '決まりを守らせる確認は、保存する処理に置きます。入力欄の上限は、入力しやすくするための補助として併用します。',
      takeaways: [
        '画面の制限は、リクエストを直接送れば通らずに済む。決まりは保存する処理で確かめる',
        '対策は「攻撃を防げたか」と「普段の使い方が壊れていないか」の両方で確かめる',
        'PatchQuest の課題は、再現 → 対策 → 検証 → 振り返りの順に進める',
      ],
    },
    guide: [
      {
        id: 'preflight',
        title: '開始前チェックを確かめる',
        body: '教材アプリの準備と、学習用の事故の注入が正しくできたかを点検しています。準備ができたら「演習を始める」を押します。',
        anchor: 'preflight',
        until: 'started',
      },
      {
        id: 'switch-user',
        title: '利用者を切り替える',
        body: '左は学習用の架空のメモ帳です。「表示する利用者」で別の利用者（たとえば bob）を選ぶと、その人としてログインした画面に切り替わります。問い合わせの内容は「状況」タブで読めます。',
        anchor: 'user-switcher',
        until: 'user-switched',
      },
      {
        id: 'send-request',
        title: 'リクエストを送ってみる',
        body: '「調査」タブを開き、「メモを作成する」の「送る」を押します。送った呼び出しと応答は観測ログに残ります。行を開くと中身を確かめられます。',
        anchor: 'actions',
        until: 'request-sent',
      },
      {
        id: 'reproduce',
        title: 'リクエストを編集して、事故を再現する',
        body: '「メモを作成する」の「編集欄にコピー」を押し、編集欄の title を 41 文字以上（たとえば「あ」を 41 個）に書き換えて「このリクエストを送る」を押します。保存できたら再現の検印が押されます。',
        anchor: 'request-editor',
        until: 'reproduced',
      },
      {
        id: 'hint',
        title: 'ヒントを開く',
        body: '「状況」タブの下にヒントがあります。3 段階あり、開いても減点されません。迷ったときに使いましょう。',
        anchor: 'hints',
        until: 'hint-opened',
      },
      {
        id: 'apply-input-only',
        title: '対策を選んで適用する',
        body: '「対策」タブで「入力欄だけで文字数を制限する」を選び、「この対策を適用する」を押します。練習のため、まずはこの対策を試します。',
        anchor: 'defense-panel',
        until: 'defense-applied',
      },
      {
        id: 'verify-failed',
        title: '検証して、失敗を確かめる',
        body: '「攻撃と普段の使い方を検証する」を押します。実際に動かして確かめるため、入力欄の制限だけでは、リクエストを直接送る呼び出しを防げずに不合格になります。',
        anchor: 'verify',
        until: 'verify-failed',
      },
      {
        id: 'verify-passed',
        title: '結果を読み、別の対策で合格する',
        body: '検証結果で、通らなかったテストの「期待」と「実測」を見比べます。次に「保存処理でタイトルの長さを検証する」を適用して、もう一度検証します。合格すると防御の検印が押されます。',
        anchor: 'results',
        until: 'verify-passed',
      },
      {
        id: 'understood',
        title: '振り返りで理解を確かめる',
        body: '「振り返り」タブで原因と対策の考え方を読み、理解確認の設問に答えます。正解すると理解の検印が押されます。',
        anchor: 'debrief',
        until: 'understood',
      },
      {
        id: 'reset',
        title: '初期状態へ戻す',
        body: '「対策」タブの「初期状態へ戻す」を押すと、対策を外し、データも演習開始時の状態に戻せます。押した検印は残ります。',
        anchor: 'reset',
        until: 'reset',
      },
      {
        id: 'export',
        title: '進捗を書き出す',
        body: '「課題一覧へ戻る」を押し、一覧の下にある「進捗を書き出す」を押します。進捗はこのブラウザの中だけに保存されるため、別のブラウザへ移すときはこのファイルを読み込みます。',
        anchor: 'progress-export',
        until: 'exported',
      },
    ],
  },
  implementations: {
    'onboarding/accept-any-title': { hook: 'memo.title.validate', run: (() => ({ ok: true })) satisfies ValidateTitle },
    'onboarding/reject-all-titles': { hook: 'memo.title.validate', run: (() => ({ ok: false, message: 'メモは保存できません' })) satisfies ValidateTitle },
    'onboarding/title-input-unlimited': { hook: 'memo.title.input', run: (() => {}) satisfies PrepareTitleInput },
  },
};
