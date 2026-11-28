// ミッション3「検索条件からの情報漏えいを防ぐ」（SQL インジェクション、spec §8.3）。
// 検索語を SQL へ文字としてつなぐ実装へ切り替え、別の利用者の架空メモが結果に含まれる事故を題材にする。
// 実行するのは SQLite。任意の SQL を書く欄は置かず、登録済みの検索語だけを送る
import type { MissionPack } from '../../platform/contract';
import { IMPLEMENTATIONS } from './implementations';
import { DEBRIEF, HINTS, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { CASES, OR_TITLE, OR_TRUE, PROBES, TARGET_CASES, UNION_TITLES } from './tests';

const SEARCH = { id: 'memo.search.query', contract: 1 };
const TARGET_APP = { appId: 'memo', versions: '^1.3.0' };
const RECIPE = 'concat-search';

/** 参考差分の変更前。検索語を SQL の文字列へつなぐ */
const CONCAT = `const search = ({ userId, term }) => {
  const softened = term.replace(/(\\p{L})'(\\p{L})/gu, "$1''$2");
  return {
    sql: \`SELECT id, owner_id AS ownerId, title FROM memos WHERE owner_id = \${userId} AND (title LIKE '%\${softened}%' OR body LIKE '%\${softened}%') ORDER BY id\`,
    bind: [],
  };
};`;

export const sqliPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'sqli',
    version: '1.12.0',
    kind: 'mission',
    title: '検索から他人のメモがもれるのを防ぐ',
    estimatedMinutes: 15,
    vulnerability: { name: 'SQL インジェクション', plain: '検索の言葉に細工をすると、見えないはずのデータまで取り出せてしまう問題', fullName: 'SQL コマンドの不適切な無害化', cwe: 'CWE-89', category: 'data-access' },
    difficulty: 'advanced',
    summary:
      '自分のメモを探す検索で、他人のメモまで出てくるという問い合わせを調べます。検索の言葉が命令として働かないように直します。',
    learningObjectives: [
      '登録済みの検索語を使って、他人のメモが検索結果に出てしまうことを再現できる',
      '「特定の言葉だけを禁止する」と「検索語を値として渡す（バインド）」の違いを説明できる',
      '対策のあと、日本語・引用符・該当なしの検索ができて、他人のメモは出ないと確かめられる',
    ],
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: { name: 'alice さん', role: 'メモアプリの利用者' },
      incident:
        '利用者の alice さんから問い合わせがありました。「自分のメモを検索したら、bob さんの非公開のメモまで出てきました。検索語を変えると、ほかの人のメモも混ざるようです」',
      goal: '検索では、検索した本人のメモだけを返します。日本語や引用符を含む言葉でも、該当がないときでも、今までどおり検索できます。',
      protectedAssets: ['ほかの利用者のメモ（検索結果に出てしまうこと）'],
      normalUse: ['自分のメモを日本語で検索できる', '引用符を含む語で検索できる', '該当がなければ空の結果になる'],
    },
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview'] },
    appCompatibility: TARGET_APP,
    prerequisites: { features: ['search'] },
    conflicts: [],
    hooks: [SEARCH],
    fixtures: { generator: 'memo.default', variants: [{ id: 'search', label: '検索', recipe: RECIPE }] },
    mutationRecipes: [
      {
        id: RECIPE,
        version: '1.0.0',
        apply: [{ hook: SEARCH.id, implementation: 'sqli/search-concat' }],
        verify: { probes: PROBES.map((probe) => probe.id) },
        revert: 'baseline',
        appliesTo: { ...TARGET_APP, hooks: [SEARCH] },
      },
    ],
    probes: PROBES,
    tests: {
      target: ['search.injection', ...TARGET_CASES.map((test) => test.id)],
      cases: CASES,
    },
    actions: [
      {
        id: 'search-verified',
        label: '登録済みの検索語で検索する',
        description:
          '自分のメモを探す検索を実行します。この操作で送れるのは、登録済みの検索語だけです。この教材が使うデータベースは SQLite です。',
        request: { method: 'GET', path: '/api/search?q={{field.q}}' },
        fields: [
          {
            name: 'q',
            label: '登録済みの検索語',
            input: 'select',
            help: '「週報」はふつうの検索です。ほかの 3 つは、持ち主の条件をすり抜けられる検索語です。観測ログの「SQL」で、実行された文・バインド値・返却行の所有者を見ます。',
            options: [
              { value: '週報', label: 'ふつうの検索（週報）' },
              { value: OR_TITLE, label: '持ち主の条件を広げる（タイトル）' },
              { value: OR_TRUE, label: '持ち主の条件を広げる（いつも正しい）' },
              { value: UNION_TITLES, label: 'UNION でメモの一覧を足す' },
            ],
          },
        ],
        editable: false,
      },
    ],
    defenses: [
      {
        id: 'parameterized',
        label: '検索語を値として渡し（バインド）、持ち主の条件を残す',
        description: '検索語を、SQL の文ではなく「値」として渡します。ログイン中の利用者のメモだけ、という条件も残します。',
        apply: [{ hook: 'memo.search.query', implementation: 'memo/search-parameterized' }],
        referenceDiff: {
          file: 'apps/memo/hooks.ts',
          language: 'ts',
          before: CONCAT,
          after: `const search = ({ userId, term }) => {
  const pattern = \`%\${term}%\`;
  return {
    sql: "SELECT id, owner_id AS ownerId, title FROM memos WHERE owner_id = ? AND (title LIKE ? ESCAPE '\\\\' OR body LIKE ? ESCAPE '\\\\') ORDER BY id",
    bind: [userId, pattern, pattern],
  };
};`,
        },
        expected: 'secure',
      },
      {
        id: 'block-union',
        label: 'UNION という言葉だけを止める',
        description: '検索語に UNION が入っていたら、何も返しません。ほかの検索語は、今までどおり SQL につなぎます。',
        apply: [{ hook: 'memo.search.query', implementation: 'sqli/search-block-union' }],
        referenceDiff: {
          file: 'apps/memo/hooks.ts',
          language: 'ts',
          before: CONCAT,
          after: `const search = ({ userId, term }) => {
  if (/union/i.test(term)) return { sql: 'SELECT ... WHERE owner_id = ? AND 0', bind: [userId] };
  return concatenated(userId, term);
};`,
        },
        whyItFails: 'UNION を使わない検索語では、条件を広げる書き方がそのまま通り、他人のメモが返ってきました。',
        expected: 'insufficient',
      },
      {
        id: 'disable-search',
        label: '検索を止める',
        description: '何を検索しても、何も返さないようにします。他人のメモは出ませんが、自分のメモも探せなくなります。',
        apply: [{ hook: 'memo.search.query', implementation: 'sqli/search-disabled' }],
        referenceDiff: {
          file: 'apps/memo/hooks.ts',
          language: 'ts',
          before: CONCAT,
          after: `const search = ({ userId }) => ({
  sql: 'SELECT id, owner_id AS ownerId, title FROM memos WHERE owner_id = ? AND 0',
  bind: [userId],
});`,
        },
        whyItFails: '他人のメモは出なくなりましたが、自分のメモも検索では見つからなくなりました。',
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
