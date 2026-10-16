import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  canTransition,
  satisfies,
  validatePack,
  type AppDescriptor,
  type ExerciseState,
  type MissionManifest,
  type MissionPack,
} from '../../platform/contract';

const app: AppDescriptor = {
  id: 'memo',
  version: '1.2.0',
  features: ['memo'],
  users: ['alice', 'bob'],
  entryRoute: '/memos',
  hooks: [{ id: 'memo.read.authorize', realm: 'server', contract: 1, baseline: 'memo/owner-check', description: '' }],
};

const noop = () => undefined;

function samplePack(): MissionPack {
  const manifest: MissionManifest = {
    schemaVersion: 1,
    id: 'sample',
    version: '1.0.0',
    kind: 'mission',
    title: 'サンプル',
    summary: '契約の検証用',
    learningObjectives: ['所有者の照合を説明できる'],
    estimatedMinutes: 10,
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
      { level: 1, text: '着眼点' },
      { level: 2, text: '調査方法' },
      { level: 3, text: '修正方針' },
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

function withManifest(change: (m: MissionManifest) => void): MissionPack {
  const pack = samplePack();
  change(pack.manifest);
  return pack;
}

describe('validatePack', () => {
  it('正しいパックはエラーなしで通る', () => {
    expect(validatePack(samplePack(), { app })).toEqual([]);
  });

  it.each<[string, (m: MissionManifest) => void, RegExp]>([
    ['必須の文字列が空', (m) => (m.title = ''), /^title: /],
    ['IDの形式が不正', (m) => (m.id = 'Sample_1'), /^id: /],
    ['パック版が x.y.z でない', (m) => (m.version = '1.0'), /^version: /],
    ['未知の機能を要求', (m) => (m.runtime.capabilities = ['linux' as never]), /^runtime\.capabilities\[0\]: /],
    ['バリエーションが未定義のレシピを参照', (m) => (m.fixtures.variants[0]!.recipe = 'missing'), /未定義のレシピ「missing」/],
    ['レシピが未定義の probe を参照', (m) => (m.mutationRecipes[0]!.verify.probes = ['missing']), /未定義のprobe「missing」/],
    ['レシピが宣言していないフックを変更', (m) => (m.mutationRecipes[0]!.apply[0]!.hook = 'comment.render'), /未定義のフック「comment.render」/],
    ['登録されていない実装を参照', (m) => (m.defenses[0]!.apply[0]!.implementation = 'sample/missing'), /実装「sample\/missing」が登録されていません/],
    ['正解の対策がない', (m) => (m.defenses[0]!.expected = 'insufficient'), /^defenses: /],
    ['ヒントの段階が欠けている', (m) => m.hints.pop(), /^hints: /],
    ['正解のない理解確認', (m) => (m.transferCheck[0]!.choices[0]!.correct = false), /正解の選択肢が必要です/],
    ['ID の重複', (m) => m.probes.push({ ...m.probes[0]! }), /「read-other」が重複しています/],
    ['テストの手順で未定義の利用者', (m) => (m.tests.cases[0]!.steps[0]!.as = 'carol'), /未定義の利用者「carol」/],
    ['チュートリアルにガイドがない', (m) => (m.kind = 'tutorial'), /^guide: /],
    [
      'ガイドのやり直しの出来事が未知',
      (manifest) => (manifest.guide = [{ id: 'g', title: 't', body: 'b', anchor: 'verify', until: 'verify-passed', retry: { when: 'oops' as never, text: 'x' } }]),
      /^guide\[0\]\.retry\.when: /,
    ],
  ])('%s場合は拒否する', (_, change, message) => {
    const errors = validatePack(withManifest(change), { app });
    expect(errors.some((e) => message.test(e)), errors.join('\n')).toBe(true);
  });

  it('依頼人は省略でき、名前・役割・各反応が非空なら受け付ける', () => {
    const pack = samplePack();
    expect(validatePack(pack, { app })).toEqual([]);
    Object.assign(pack.manifest.story, {
      requester: { name: '依頼人', role: '利用者', reactions: { reproduced: '心配です', secured: 'ありがとう', closing: '安心しました' } },
    });
    expect(validatePack(pack, { app })).toEqual([]);
  });

  it.each(['name', 'role', 'reproduced', 'secured', 'closing'])('依頼人の%sが空なら拒否する', (field) => {
    const requester = { name: '依頼人', role: '利用者', reactions: { reproduced: '心配です', secured: 'ありがとう', closing: '安心しました' } };
    const target = field === 'name' || field === 'role' ? requester : requester.reactions;
    Reflect.set(target, field, '  ');
    const pack = samplePack();
    Object.assign(pack.manifest.story, { requester });
    const path = field === 'name' || field === 'role' ? field : `reactions.${field}`;
    expect(validatePack(pack, { app })).toEqual([expect.stringContaining(`story.requester.${path}:`)]);
  });

  it.each([null, '依頼人', { name: '依頼人', role: '利用者' }])('依頼人や反応がオブジェクトでなければ拒否する', (requester) => {
    const pack = samplePack();
    Object.assign(pack.manifest.story, { requester });
    expect(validatePack(pack, { app }).some((error) => error.startsWith('story.requester'))).toBe(true);
  });

  it('アプリとの非互換（版・フック契約・機能）を拒否する', () => {
    const errors = validatePack(samplePack(), {
      app: { ...app, version: '2.0.0', features: [], hooks: [{ ...app.hooks[0]!, contract: 2 }] },
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^appCompatibility\.versions: アプリの版 2\.0\.0 が範囲外/),
        expect.stringMatching(/^hooks\[0\]\.contract: アプリのフック契約は 2/),
        expect.stringMatching(/^prerequisites\.features\[0\]: アプリに機能「memo」がありません/),
      ]),
    );
  });

  it('実装を別のフック用に登録している場合は拒否する', () => {
    const pack = samplePack();
    pack.implementations['sample/no-owner-check'] = { hook: 'comment.render', run: noop };
    expect(validatePack(pack, { app })).toEqual([expect.stringMatching(/実装はフック「comment\.render」用です/)]);
  });

  it('画面（view）のフックを交換するパックは dom-preview を要求していなければ拒否する', () => {
    const withView: AppDescriptor = { ...app, hooks: [...app.hooks, { id: 'comment.render', realm: 'view', contract: 1, baseline: 'memo/comment-text', description: '' }] };
    const pack = withManifest((m) => m.hooks.push({ id: 'comment.render', contract: 1 }));
    expect(validatePack(pack, { app: withView })).toEqual([expect.stringMatching(/dom-preview が必要です/)]);
    pack.manifest.runtime.capabilities.push('dom-preview');
    expect(validatePack(pack, { app: withView })).toEqual([]);
  });

  it('実装 ID が課題 ID で始まらない場合は拒否する', () => {
    const pack = samplePack();
    pack.implementations['other/owner-check'] = { hook: 'memo.read.authorize', run: noop };
    expect(validatePack(pack, { app })).toEqual([expect.stringMatching(/^implementations\.other\/owner-check: 実装 ID は「sample\/」で始めてください/)]);
  });

  it('パック固有のテスト ID がアプリ共通のテストと重なる場合は拒否する', () => {
    const pack = samplePack();
    const id = pack.manifest.tests.cases[0]!.id;
    expect(validatePack(pack, { app, appTestIds: [id] })).toEqual([expect.stringMatching(new RegExp(`テスト ID「${id}」はアプリ共通のテストと重複しています`))]);
  });

  it('アプリ共通のテスト ID を target に指定できる', () => {
    const pack = withManifest((m) => (m.tests.target = ['memo.read.other-denied']));
    expect(validatePack(pack, { app, appTestIds: ['memo.read.other-denied'] })).toEqual([]);
    expect(validatePack(pack, { app, appTestIds: [] })).toEqual([expect.stringMatching(/未定義のテスト/)]);
  });

  it('オブジェクトでない値も例外を出さずに拒否する', () => {
    expect(validatePack({ manifest: null as never, implementations: {} }).length).toBeGreaterThan(0);
  });
});

describe('satisfies', () => {
  it.each([
    ['1.2.0', '1.2.0', true],
    ['1.2.1', '1.2.0', false],
    ['1.2.0', '^1.0.0', true],
    ['1.0.5', '^1.1.0', false],
    ['2.0.0', '^1.0.0', false],
    ['1.0', '^1.0.0', false],
  ])('%s は %s を満たすか: %s', (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });
});

describe('演習状態の遷移', () => {
  it('Passed には検証か理解確認を経てのみ到達し、Blocked からは事前検証のやり直しだけができる', () => {
    const into = (to: ExerciseState) => (Object.keys(TRANSITIONS) as ExerciseState[]).filter((from) => canTransition(from, to));
    expect(into('Passed').sort()).toEqual(['Repairing', 'Verifying']);
    expect(TRANSITIONS.Blocked).toEqual(['Preflight']);
    expect(canTransition('Selected', 'Prepared')).toBe(false);
  });
});
