// 課題「終わらない入力チェックを直す」（ReDoS、CWE-1333、Issue #238）。
// 表示名の入力チェックを、入れ子のくり返しを持つ正規表現へ切り替え、使ってよい文字を並べただけの入力で照合が終わらなくなる事故を題材にする。
// 照合するのは正規表現エンジン PCRE2（WASM）。合否は経過時間ではなく、エンジンが処理の上限（match limit）に達したかどうかで決まる
import type { MissionPack } from '../../platform/contract';
import { NAME_PATTERN } from '../../apps/memo/profile';
import { IMPLEMENTATIONS, NESTED_PATTERN, SHORT_MAX_LENGTH } from './implementations';
import { APPROACH, DEBRIEF, HINTS, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { CASES, PROBES } from './tests';

const VALIDATE = { id: 'profile.name.validate', contract: 1 };
/** 表示名の変更（profile.name.validate）を持つ版から対応する */
const TARGET_APP = { appId: 'memo', versions: '^1.4.0' };
const RECIPE = 'nested-quantifier';
const DIFF_FILE = 'apps/memo/profile.ts';

/** 参考差分に載せる、表示名の入力チェック。正規表現（pattern）と、照合の前後の処理（before・onLimit）が対策ごとに違う */
const validateSource = (pattern: string, { before = '', onLimit = "{ status: 'aborted' }" } = {}) => `const NAME = '${pattern}';

const validateName = (ctx, name) => {${before}
  const outcome = ctx.regex.match(NAME, name).outcome;
  if (outcome === 'limit') return ${onLimit};
  return outcome === 'match' ? { status: 'ok' } : { status: 'invalid' };
};`;
/** 注入した状態（参考差分の変更前） */
const NESTED_SOURCE = validateSource(NESTED_PATTERN);

/** 同じ文字を count 個並べて、最後だけ ! にした表示名の選択肢 */
const repeated = (count: number) => ({ value: `${'a'.repeat(count)}!`, label: `a が ${count} 個と !（${count + 1} 文字）` });

export const redosPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'redos',
    version: '1.0.0',
    kind: 'mission',
    title: '終わらない入力チェックを直す',
    estimatedMinutes: 15,
    vulnerability: {
      name: 'ReDoS',
      plain: '入力チェックの正規表現が、細工した入力で終わらなくなり、サービスが応答できなくなる問題',
      fullName: '非効率な正規表現による処理量の増大',
      cwe: 'CWE-1333',
      category: 'input-validation',
    },
    difficulty: 'intermediate',
    summary:
      '表示名を変えようとすると、入力チェックが終わらずに打ち切られるという報告を調べます。入力の長さと、正規表現エンジンが試した回数の関係を見て、正規表現を直します。',
    learningObjectives: [
      '同じ文字を並べて最後だけ使えない文字にした表示名で、入力チェックが打ち切られることを再現できる',
      '入力が 1 文字増えるたびに、正規表現エンジンが試す回数が 2 倍になる理由を説明できる',
      '対策のあと、決まりに合う表示名は変えられ、合わない表示名はすぐに断られると確かめられる',
    ],
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: { name: '運用担当', role: 'メモアプリの運用担当' },
      incident:
        '運用担当から報告がありました。「表示名の変更で、入力チェックが終わらずに打ち切られた記録が続いています。送られていたのは、同じ文字が並んで、最後だけ使えない文字の表示名でした。使えない文字は 1 つだけなのに、なぜ断るのにこれほど手間がかかるのでしょうか」',
      goal: '決まりに合わない表示名は、入力チェックが最後まで終わって断られます。決まりに合う表示名には、今までどおり変えられます。',
      protectedAssets: ['サービスが応答し続けること（入力チェックが最後まで終わること）'],
      normalUse: ['決まりに合う表示名に変えられる（20 文字まで）', '決まりに合わない表示名は、理由を示して断る'],
    },
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview', 'pcre2'] },
    appCompatibility: TARGET_APP,
    prerequisites: { features: ['profile'] },
    conflicts: [],
    hooks: [VALIDATE],
    fixtures: { generator: 'memo.default', variants: [{ id: 'display-name', label: '表示名', recipe: RECIPE }] },
    mutationRecipes: [
      {
        id: RECIPE,
        version: '1.0.0',
        apply: [{ hook: VALIDATE.id, implementation: 'redos/name-nested' }],
        verify: { probes: PROBES.map((probe) => probe.id) },
        revert: 'baseline',
        appliesTo: { ...TARGET_APP, hooks: [VALIDATE] },
      },
    ],
    probes: PROBES,
    tests: {
      target: ['profile.name.check-completes', ...CASES.map((test) => test.id)],
      cases: CASES,
    },
    actions: [
      {
        id: 'change-name',
        label: '登録済みの表示名に変える',
        description:
          'ログイン中の利用者の表示名を変えます。入力チェックの正規表現は、正規表現エンジン PCRE2 で照合します。画面の「表示名」からは、好きな表示名を送れます。',
        request: { method: 'PUT', path: '/api/me', body: { name: '{{field.name}}' } },
        fields: [
          {
            name: 'name',
            label: '登録済みの表示名',
            input: 'select',
            help: '「ふつうの名前」は決まりに合う表示名です。ほかは、a を並べて最後だけ使えない文字（!）にした表示名で、長さが違います。観測ログの「正規表現」で、入力の文字数と、パターンの項目を試した回数を見ます。',
            options: [{ value: 'taro.yamada', label: 'ふつうの名前（taro.yamada）' }, ...[4, 8, 12, 16, 19].map(repeated)],
          },
        ],
        editable: false,
      },
    ],
    approach: APPROACH,
    defenses: [
      {
        id: 'rewrite-pattern',
        label: '記号を、かたまりとかたまりの間に必ず 1 つと書き直し、分け方を 1 通りにする',
        description: '正規表現を、「英数字のかたまり」のあとに「記号 1 つ＋英数字のかたまり」をくり返す形に書き直します。受け入れる表示名は変わりません。',
        apply: [{ hook: VALIDATE.id, implementation: 'memo/name-pattern' }],
        referenceDiff: { file: DIFF_FILE, language: 'ts', before: NESTED_SOURCE, after: validateSource(NAME_PATTERN) },
        expected: 'secure',
      },
      {
        id: 'shorten',
        label: `表示名を ${SHORT_MAX_LENGTH} 文字までに縮める`,
        description: `正規表現はそのままにして、${SHORT_MAX_LENGTH} 文字より長い表示名を、照合の前に断ります。`,
        apply: [{ hook: VALIDATE.id, implementation: 'redos/name-short-only' }],
        referenceDiff: {
          file: DIFF_FILE,
          language: 'ts',
          before: NESTED_SOURCE,
          after: validateSource(NESTED_PATTERN, { before: `\n  if (name.length > ${SHORT_MAX_LENGTH}) return { status: 'invalid' };` }),
        },
        whyItFails: `入力チェックは最後まで終わるようになりましたが、決まりに合う ${SHORT_MAX_LENGTH + 1} 文字以上の表示名が断られました。`,
        expected: 'breaks-normal',
      },
      {
        id: 'fail-open',
        label: '打ち切られたら、チェックを通ったことにする',
        description: '正規表現はそのままにして、エンジンが照合を打ち切ったときは、表示名を受け入れます。',
        apply: [{ hook: VALIDATE.id, implementation: 'redos/name-fail-open' }],
        referenceDiff: { file: DIFF_FILE, language: 'ts', before: NESTED_SOURCE, after: validateSource(NESTED_PATTERN, { onLimit: "{ status: 'ok' }" }) },
        whyItFails: 'エンジンは処理の上限に達したままで、使えない文字の入った表示名が、確かめられないまま保存されました。',
        expected: 'insufficient',
      },
      {
        id: 'reject-all',
        label: '表示名の変更を止める',
        description: 'どんな表示名も、照合せずに断ります。入力チェックは終わりますが、だれも表示名を変えられなくなります。',
        apply: [{ hook: VALIDATE.id, implementation: 'redos/name-reject-all' }],
        referenceDiff: { file: DIFF_FILE, language: 'ts', before: NESTED_SOURCE, after: "const validateName = () => ({ status: 'invalid' });" },
        whyItFails: '入力チェックは最後まで終わるようになりましたが、決まりに合う表示名にも変えられなくなりました。',
        expected: 'breaks-normal',
      },
    ],
    hints: HINTS,
    solution: SOLUTION,
    transferCheck: TRANSFER_CHECK,
    debrief: DEBRIEF,
  },
  implementations: IMPLEMENTATIONS,
};
