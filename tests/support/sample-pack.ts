// validatePack の検証に使うサンプルの課題パックと教材アプリ記述子。契約の各テストで共有する。
import type { AppDescriptor, MissionManifest, MissionPack } from '../../platform/contract';

export const sampleApp: AppDescriptor = {
  id: 'memo',
  version: '1.2.0',
  features: ['memo'],
  users: ['alice', 'bob'],
  entryRoute: '/memos',
  hooks: [{ id: 'memo.read.authorize', realm: 'server', contract: 1, baseline: 'memo/owner-check', description: '' }],
};

export const noop = () => undefined;

export function samplePack(): MissionPack {
  const manifest: MissionManifest = {
    schemaVersion: 1,
    id: 'sample',
    version: '1.0.0',
    kind: 'mission',
    release: 'stable',
    title: 'サンプル',
    summary: '契約の検証用',
    learningObjectives: ['所有者の照合を説明できる'],
    estimatedMinutes: 10,
    vulnerability: { name: 'IDOR', plain: '番号を変えると他人のメモが読める問題', fullName: '安全でない直接オブジェクト参照', cwe: 'CWE-639', category: 'authorization' },
    difficulty: 'beginner',
    story: { incident: '問い合わせ', goal: '守る', protectedAssets: ['非公開メモ'], normalUse: ['本人が読める'] },
    appCompatibility: { appId: 'memo', versions: '^1.0.0' },
    runtime: { adapter: 'browser', capabilities: ['sqlite'] },
    prerequisites: { features: ['memo'] },
    hooks: [{ id: 'memo.read.authorize', contract: 1 }],
    conflicts: [],
    fixtures: { generator: 'memo.default', variants: [{ id: 'default', label: '標準', recipe: 'no-owner-check' }] },
    mutationRecipes: [
      {
        id: 'no-owner-check',
        version: '1.0.0',
        appliesTo: { appId: 'memo', versions: '^1.0.0', hooks: [{ id: 'memo.read.authorize', contract: 1 }] },
        apply: [{ hook: 'memo.read.authorize', implementation: 'sample/no-owner-check' }],
        verify: { probes: ['read-other'] },
        revert: 'baseline',
      },
    ],
    actions: [
      {
        id: 'get-memo',
        label: 'ID指定で取得',
        description: 'メモをIDで取得する',
        request: { method: 'GET', path: '/api/memos/{{field.id}}' },
        fields: [{ name: 'id', label: 'メモID', input: 'number' }],
        editable: true,
      },
    ],
    defenses: [
      {
        id: 'owner-check',
        label: '所有者を照合',
        description: '取得時に所有者を照合する',
        apply: [{ hook: 'memo.read.authorize', implementation: 'sample/owner-check' }],
        referenceDiff: { file: 'memos.ts', language: 'ts', before: 'a', after: 'b' },
        expected: 'secure',
      },
    ],
    probes: [
      {
        id: 'read-other',
        title: '他人のメモを読める',
        steps: [{ kind: 'request', as: 'bob', request: { method: 'GET', path: '/api/memos/{{memos.alice.private.id}}' }, expect: { status: 200 } }],
        detect: { actor: { not: 'alice' }, response: { status: 200 } },
      },
    ],
    tests: {
      target: ['sample.read-other-denied'],
      cases: [
        {
          id: 'sample.read-other-denied',
          category: 'security',
          title: '他人のメモは読めない',
          steps: [{ kind: 'request', as: 'bob', request: { method: 'GET', path: '/api/memos/{{memos.alice.private.id}}' }, expect: { status: [403, 404] } }],
        },
      ],
    },
    hints: [
      { level: 1, text: '見るところ' },
      { level: 2, text: '調べ方' },
      { level: 3, text: '直し方' },
    ],
    solution: '取得時に所有者を照合する',
    transferCheck: [
      {
        id: 'q1',
        situation: '別の利用者',
        prompt: 'どれが有効か',
        choices: [
          { id: 'a', label: '所有者を照合', correct: true, explanation: '取得時に確認する' },
          { id: 'b', label: 'リンクを隠す', correct: false, explanation: '直接取得できる' },
        ],
      },
    ],
    debrief: { cause: '所有者を照合していない', defenseRationale: '取得時に照合する', takeaways: ['画面ではなく処理で守る'] },
  };
  return {
    manifest,
    implementations: {
      'sample/no-owner-check': { hook: 'memo.read.authorize', run: noop },
      'sample/owner-check': { hook: 'memo.read.authorize', run: noop },
    },
  };
}

export function withManifest(change: (m: MissionManifest) => void): MissionPack {
  const pack = samplePack();
  change(pack.manifest);
  return pack;
}
