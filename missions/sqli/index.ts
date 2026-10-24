// ミッション3「検索条件からの情報漏えいを防ぐ」（SQL インジェクション、spec §8.3）。
// 検索語を SQL へ文字としてつなぐ実装へ切り替え、別の利用者の架空メモが結果に含まれる事故を題材にする。
// 実行するのは SQLite。任意の SQL を書く欄は置かず、登録済みの検索語だけを送る
import type { MissionPack } from '../../platform/contract';
import { IMPLEMENTATIONS } from './implementations';
import { DEBRIEF, HINTS, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { CASES, OR_TITLE, OR_TRUE, PROBES, TARGET_CASES, UNION_TITLES } from './tests';

const SEARCH = { id: 'memo.search.query', contract: 1 };
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
    version: '1.7.0',
    kind: 'mission',
    title: '検索条件からの情報漏えいを防ぐ',
    estimatedMinutes: 15,
    vulnerability: { name: 'SQL インジェクション', plain: '検索の言葉に細工をすると、見えないはずのデータまで取り出せてしまう問題', fullName: 'SQL コマンドの不適切な無害化', cwe: 'CWE-89', category: 'data-access' },
    difficulty: 'advanced',
    summary:
      '自分のメモを探す検索で、別の利用者のメモまで結果に含まれる問い合わせを調べます。検索語のつなぎ込みを、値としてバインドするクエリに戻します。',
    learningObjectives: [
      '登録済みの検索語で、所有者の条件を迂回し、別の利用者のメモが結果に含まれることを再現できる',
      '特定の語だけを禁止することと、検索語を値としてバインドすることの違いを説明できる',
      '対策のあと、日本語・引用符・該当なしの検索ができ、他人のメモは返らないことを確かめられる',
    ],
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: {
        name: 'alice さん', role: 'メモアプリの利用者',
        reactions: {
          reproduced: '検索でほかの人のメモまで出てしまうんだね。',
          secured: '直してくれてありがとう。自分のメモをこれまでどおり探せるね。',
          closing: '検索語は命令ではなく、探したい値として扱うんだね。',
        },
      },
      incident:
        '利用者の alice さんから問い合わせがありました。「自分のメモを検索したら、bob さんの非公開のメモまで結果に出ていました。検索語を変えると、ほかの人のメモも混ざるようです」',
      goal: '検索は、検索した本人のメモだけを返します。日本語や引用符を含む語でも、該当が無いときでも、自分のメモの検索はこれまでどおり使えます。',
      protectedAssets: ['ほかの利用者のメモ（検索結果に含まれてしまうこと）'],
      normalUse: ['自分のメモを日本語で検索できる', '引用符を含む語で検索できる', '該当がなければ空の結果になる'],
    },
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview'] },
    appCompatibility: { appId: 'memo', versions: '^1.3.0' },
    prerequisites: { features: ['search'] },
    conflicts: [],
    hooks: [SEARCH],
    fixtures: { generator: 'memo.default', variants: [{ id: 'search', label: '検索', recipe: RECIPE }] },
    mutationRecipes: [
      {
        id: RECIPE,
        version: '1.0.0',
        apply: [{ hook: 'memo.search.query', implementation: 'sqli/search-concat' }],
        verify: { probes: ['search-as-alice', 'search-as-bob', 'search-as-carol'] },
        revert: 'baseline',
        appliesTo: { appId: 'memo', versions: '^1.3.0', hooks: [SEARCH] },
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
          '自分のメモを探す検索を実行します。送れる検索語は登録済みのものだけです。自由に SQL を書く欄はありません。この教材が実行するのは SQLite です。',
        request: { method: 'GET', path: '/api/search?q={{field.q}}' },
        fields: [
          {
            name: 'q',
            label: '登録済みの検索語',
            input: 'select',
            help: '「週報」は普通の検索です。ほかの三つは、所有者の条件を迂回できると確認した検索語です。観測ログのクエリ形・バインド値・返却行の所有者を見ます。',
            options: [
              { value: '週報', label: '普通の検索（週報）' },
              { value: OR_TITLE, label: '所有者の条件を広げる（タイトル）' },
              { value: OR_TRUE, label: '所有者の条件を広げる（常に真）' },
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
        label: '検索語を値としてバインドし、所有者の条件を残す',
        description: '検索語をプレースホルダの値として渡し、ログイン中の利用者のメモだけを対象にする条件を残します。',
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
        label: 'UNION という語だけを止める',
        description: '検索語に UNION が含まれていたら行を返しません。それ以外の検索語は、これまでどおり SQL へつなぎます。',
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
        whyItFails: 'UNION という語を含まない検索語では、条件を広げる書き方がこれまでどおり通り、他人のメモが返ってきました。',
        expected: 'insufficient',
      },
      {
        id: 'disable-search',
        label: '検索を止める',
        description: '何を検索しても行を返さないようにします。他人のメモは出ませんが、自分のメモも探せなくなります。',
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
