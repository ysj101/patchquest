// ミッション1「非公開メモを守る」（IDOR、spec §8.1）。メモを ID 指定で取り出す処理が所有者を照合せず、
// 別の利用者の非公開メモが読める事故を題材に、画面ではなく取り出す処理の側で認可することを学ぶ
import type { MissionPack } from '../../platform/contract';
import { IMPLEMENTATIONS } from './implementations';
import { DEBRIEF, HINTS, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { CASES, PROBES, TARGET_CASES } from './tests';

const HOOKS = [
  { id: 'memo.read.authorize', contract: 1 },
  { id: 'memo.detail.neighbors', contract: 1 },
];
/** 前後のメモの移動先（memo.detail.neighbors）を持つ版から対応する */
const TARGET_APP = { appId: 'memo', versions: '^1.3.0' };
const RECIPE = 'no-owner-check';
/** 参考差分に載せる、ID 指定でメモを取り出す処理。メモが見つかった後の判断（ending）だけが対策ごとに違う */
const readMemoSource = (ending: string) => `const readMemo = (ctx, { id, user }) => {
  if (!user) return { status: 'unauthenticated' };
  const memo = findMemo(ctx.db, id);
  if (!memo) return { status: 'not-found' };
${ending}
};`;
/** 注入した状態（参考差分の変更前） */
const READ_WITHOUT_OWNER_CHECK = readMemoSource("  return { status: 'ok', memo };");

export const idorPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'idor',
    version: '1.5.0',
    kind: 'mission',
    title: '非公開メモを守る',
    summary:
      '別の利用者の非公開メモが見えるという問い合わせを調べます。メモの番号を変えるだけで他人のメモが読める原因を突き止め、画面ではなくメモを取り出す処理の側で守ります。',
    learningObjectives: [
      '利用者を切り替えて、別の利用者の非公開メモを ID 指定で読めてしまうことを再現できる',
      '画面のリンクを隠すことと、取り出す処理で所有者を照合することの違いを説明できる',
      '対策の後も、所有者がメモを作成・閲覧・更新・削除できることを確かめられる',
    ],
    estimatedMinutes: 15,
    vulnerability: { name: 'IDOR', fullName: '安全でない直接オブジェクト参照', cwe: 'CWE-639', category: 'authorization' },
    difficulty: 'beginner',
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: {
        name: 'bob さん', role: 'メモアプリの利用者',
        reactions: {
          reproduced: 'ほかの人のメモまで読めてしまうんだね。自分のメモも心配だよ。',
          secured: '守ってくれてありがとう。自分のメモはこれまでどおり読めるね。',
          closing: '誰のメモかを確かめることが大切なんだね。',
        },
      },
      incident:
        '利用者の bob さんから問い合わせがありました。「自分のメモを開いて『前のメモ』を押したら、知らない人の非公開メモが表示されました。私のメモもほかの人に見られていないか心配です」',
      goal: '非公開メモは、書いた本人（所有者）だけが読めるようにします。所有者はこれまでどおり、自分のメモを作成・閲覧・更新・削除できるようにします。',
      protectedAssets: ['所有者だけが読める非公開メモの本文'],
      normalUse: ['所有者は自分のメモを読める', '所有者はメモを作成・更新・削除できる'],
    },
    appCompatibility: TARGET_APP,
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview'] },
    hooks: HOOKS,
    conflicts: [],
    prerequisites: { features: ['memo'] },
    fixtures: { generator: 'memo.default', variants: [{ id: 'default', label: '標準', recipe: RECIPE }] },
    mutationRecipes: [
      {
        id: RECIPE,
        version: '1.0.0',
        appliesTo: { ...TARGET_APP, hooks: HOOKS },
        apply: [
          { hook: 'memo.read.authorize', implementation: 'idor/read-without-owner-check' },
          { hook: 'memo.detail.neighbors', implementation: 'idor/neighbors-by-number' },
        ],
        verify: { probes: PROBES.map((probe) => probe.id) },
        revert: 'baseline',
      },
    ],
    actions: [
      {
        id: 'list-own',
        label: '自分のメモの一覧を取得する',
        description: 'いまの利用者のメモの ID とタイトルを取得します（GET /api/memos）。',
        request: { method: 'GET', path: '/api/memos' },
        fields: [],
        editable: true,
      },
      {
        id: 'read-memo',
        label: 'ID を指定してメモを取得する',
        description: '指定した ID のメモを取得します（GET /api/memos/{ID}）。',
        request: { method: 'GET', path: '/api/memos/{{field.id}}' },
        fields: [{ name: 'id', label: 'メモの ID', input: 'number', help: '数字で入力します。自分のメモの ID は、一覧の取得や観測ログで確かめられます。' }],
        editable: true,
      },
    ],
    defenses: [
      {
        id: 'hide-links',
        label: '画面のリンクだけを隠す',
        description: 'メモの詳細画面の「前のメモ」「次のメモ」が、自分のメモの間だけを移動するように直します。他人のメモへのリンクは画面に出なくなります。',
        apply: [{ hook: 'memo.detail.neighbors', implementation: 'memo/neighbors-own' }],
        referenceDiff: {
          file: 'apps/memo/view.ts',
          language: 'ts',
          before: 'const pickNeighbors = ({ id }) => ({ prev: id - 1, next: id + 1 });',
          after:
            'const pickNeighbors = ({ id, ownIds }) => {\n  const before = ownIds.filter((own) => own < id);\n  const after = ownIds.filter((own) => own > id);\n  return {\n    prev: before.length > 0 ? Math.max(...before) : null,\n    next: after.length > 0 ? Math.min(...after) : null,\n  };\n};',
        },
        expected: 'insufficient',
      },
      {
        id: 'owner-check',
        label: '取り出す処理で、ログイン中の利用者と所有者を照合する',
        description: 'メモを ID 指定で取り出す処理で、セッションから決まる利用者がそのメモの所有者かを確かめます。所有者でなければ本文を返さず、403 で断ります。',
        apply: [{ hook: 'memo.read.authorize', implementation: 'memo/read-owner-check' }],
        referenceDiff: {
          file: 'apps/memo/hooks.ts',
          language: 'ts',
          before: READ_WITHOUT_OWNER_CHECK,
          after: readMemoSource("  if (memo.ownerId !== user.id) return { status: 'forbidden' };\n  return { status: 'ok', memo };"),
        },
        expected: 'secure',
      },
      {
        id: 'deny-all',
        label: 'ID 指定でのメモの取得をすべて断る',
        description: '他人のメモが読まれないよう、ID を指定したメモの取得を、誰からの要求でも断ります。',
        apply: [{ hook: 'memo.read.authorize', implementation: 'idor/read-deny-all' }],
        referenceDiff: {
          file: 'apps/memo/hooks.ts',
          language: 'ts',
          before: READ_WITHOUT_OWNER_CHECK,
          after: readMemoSource("  return { status: 'forbidden' };"),
        },
        expected: 'breaks-normal',
      },
    ],
    probes: PROBES,
    tests: {
      target: ['memo.read.other-denied', 'memo.create.owner-spoof', ...TARGET_CASES.map((test) => test.id)],
      cases: CASES,
    },
    hints: HINTS,
    solution: SOLUTION,
    transferCheck: TRANSFER_CHECK,
    debrief: DEBRIEF,
  },
  implementations: IMPLEMENTATIONS,
};
