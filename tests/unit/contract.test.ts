import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  canTransition,
  satisfies,
  splitInlineCode,
  validatePack,
  type AppDescriptor,
  type ExerciseState,
  type MissionManifest,
} from '../../platform/contract';

import { noop, sampleApp as app, samplePack, withManifest } from '../support/sample-pack';


describe('validatePack', () => {
  it('正しいパックはエラーなしで通る', () => {
    expect(validatePack(samplePack(), { app })).toEqual([]);
  });

  it.each<[string, (m: MissionManifest) => void, RegExp]>([
    ['必須の文字列が空', (m) => (m.title = ''), /^title: /],
    ['IDの形式が不正', (m) => (m.id = 'Sample_1'), /^id: /],
    ['パック版が x.y.z でない', (m) => (m.version = '1.0'), /^version: /],
    ['未知の機能を要求', (m) => (m.runtime.capabilities = ['linux' as never]), /^runtime\.capabilities\[0\]: /],
    ['課題なのに脆弱性の種類がない', (manifest) => delete manifest.vulnerability, /^vulnerability: kind が mission/],
    ['CWE の ID の形式が不正', (manifest) => Object.assign(manifest.vulnerability ?? {}, { cwe: '639' }), /^vulnerability\.cwe: /],
    ['未知の脆弱性の分類', (manifest) => Object.assign(manifest.vulnerability ?? {}, { category: 'crypto' }), /^vulnerability\.category: /],
    ['一言でいうとが空', (manifest) => Object.assign(manifest.vulnerability ?? {}, { plain: '' }), /^vulnerability\.plain: /],
    ['課題なのに難易度がない', (manifest) => delete manifest.difficulty, /^difficulty: kind が mission/],
    ['未知の難易度', (manifest) => (manifest.difficulty = 'expert' as never), /^difficulty: /],
    ['バリエーションが未定義のレシピを参照', (m) => (m.fixtures.variants[0]!.recipe = 'missing'), /未定義のレシピ「missing」/],
    ['レシピが未定義の probe を参照', (m) => (m.mutationRecipes[0]!.verify.probes = ['missing']), /未定義のprobe「missing」/],
    ['レシピが宣言していないフックを変更', (m) => (m.mutationRecipes[0]!.apply[0]!.hook = 'comment.render'), /未定義のフック「comment.render」/],
    ['登録されていない実装を参照', (m) => (m.defenses[0]!.apply[0]!.implementation = 'sample/missing'), /実装「sample\/missing」が登録されていません/],
    ['正解の対策がない', (m) => (m.defenses[0]!.expected = 'insufficient'), /^defenses: /],
    [
      '不十分な対策に whyItFails がない',
      (manifest) => {
        manifest.defenses.push({
          id: 'hide',
          label: '画面だけ変える',
          description: 'リンクを隠す',
          apply: [{ hook: 'memo.read.authorize', implementation: 'sample/owner-check' }],
          referenceDiff: { file: 'memos.ts', language: 'ts', before: 'a', after: 'b' },
          expected: 'insufficient',
        } as MissionManifest['defenses'][number]);
      },
      /^defenses\[1\]\.whyItFails: /,
    ],
    [
      '安全な対策に whyItFails がある',
      (manifest) => {
        const defense = manifest.defenses[0];
        if (defense === undefined) throw new Error('対策がありません');
        Object.assign(defense, { whyItFails: '画面のリンクを隠しても、ID を直接指定した取得はそのまま通りました。' });
      },
      /^defenses\[0\]\.whyItFails: /,
    ],
    ['対策に apply も replay もない', (manifest) => { const [defense] = manifest.defenses; if (defense) defense.apply = []; }, /^defenses\[0\]\.apply: /],
    ['再生の利用者が未定義', (manifest) => { const [defense] = manifest.defenses; if (defense) defense.replay = [{ as: 'carol', request: { method: 'POST', path: '/x' } }]; }, /^defenses\[0\]\.replay\[0\]\.as: /],
    ['再生のメソッドが不正', (manifest) => { const [defense] = manifest.defenses; if (defense) defense.replay = [{ as: 'bob', request: { method: 'PATCH' as never, path: '/x' } }]; }, /^defenses\[0\]\.replay\[0\]\.request\.method: /],
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

  it('対策は apply の代わりに replay だけでも受け付ける（操作で直す課題）', () => {
    const pack = samplePack();
    pack.manifest.defenses.push({
      id: 'fix-by-ops',
      label: '設定を直す',
      description: '管理者の操作で直す',
      apply: [],
      replay: [{ as: 'bob', request: { method: 'POST', path: '/fix', body: { value: 'ok' } } }],
      referenceDiff: { file: 'config', language: 'ts', before: 'a', after: 'b' },
      expected: 'secure',
    });
    expect(validatePack(pack, { app })).toEqual([]);
  });

  it('record（操作で直す）課題は対策候補が空でも、secure 必須を課さない', () => {
    const pack = samplePack();
    pack.manifest.repair = { kind: 'record', record: { kind: 'request', request: { method: 'POST', path: '/shell' } }, noun: '加えた変更' };
    pack.manifest.defenses = [];
    expect(validatePack(pack, { app })).toEqual([]);
  });

  it.each<[string, (m: MissionManifest) => void, RegExp]>([
    ['修正方式の種類が未知', (manifest) => (manifest.repair = { kind: 'patch' as never, record: {}, noun: 'n' }), /^repair\.kind: /],
    ['修正の記録の条件がない', (manifest) => (manifest.repair = { kind: 'record', record: 'x' as never, noun: 'n' }), /^repair\.record: /],
    ['記録の呼び名が空', (manifest) => (manifest.repair = { kind: 'record', record: {}, noun: '' }), /^repair\.noun: /],
  ])('修正方式が壊れている（%s）場合は拒否する', (_, change, message) => {
    expect(validatePack(withManifest(change), { app }).some((error) => message.test(error))).toBe(true);
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

  it('仕組みの例は省略でき、題名・手順・分かることが非空なら受け付ける', () => {
    const pack = samplePack();
    delete pack.manifest.story.workedExample;
    expect(validatePack(pack, { app })).toEqual([]);
    pack.manifest.story.workedExample = { title: '例', steps: ['入力', '結果'], takeaway: '分かること' };
    expect(validatePack(pack, { app })).toEqual([]);
  });

  it.each([
    ['title', { title: ' ', steps: ['入力'], takeaway: '分かること' }],
    ['steps', { title: '例', steps: [], takeaway: '分かること' }],
    ['steps[0]', { title: '例', steps: [''], takeaway: '分かること' }],
    ['takeaway', { title: '例', steps: ['入力'], takeaway: '' }],
  ])('仕組みの例の %s が空なら拒否する', (path, example) => {
    const pack = samplePack();
    pack.manifest.story.workedExample = example;
    expect(validatePack(pack, { app })).toEqual([expect.stringContaining(`story.workedExample.${path}:`)]);
  });

  it('調べ方は省略でき、説明と手順が非空なら受け付ける', () => {
    const pack = samplePack();
    expect(pack.manifest.approach).toBeUndefined();
    expect(validatePack(pack, { app })).toEqual([]);
    pack.manifest.approach = { intro: '前提の仕組み', steps: ['最初に打つコマンド', '比べるもの'] };
    expect(validatePack(pack, { app })).toEqual([]);
  });

  it.each([
    ['intro', { intro: ' ', steps: ['手順'] }],
    ['steps', { intro: '前提の仕組み', steps: [] }],
    ['steps[0]', { intro: '前提の仕組み', steps: [''] }],
  ])('調べ方の %s が空なら拒否する', (path, approach) => {
    const pack = samplePack();
    pack.manifest.approach = approach;
    expect(validatePack(pack, { app })).toEqual([expect.stringContaining(`approach.${path}:`)]);
  });

  it('調べ方の説明と手順は、バッククォートで囲んだコードを含めても受け付ける', () => {
    const pack = samplePack();
    pack.manifest.approach = { intro: '`sudo` は権限を切り替える', steps: ['`sudo -l` で一覧を見る', '囲まない手順'] };
    expect(validatePack(pack, { app })).toEqual([]);
  });

  it.each([
    ['intro', { intro: '`sudo は閉じていない', steps: ['手順'] }],
    ['steps[1]', { intro: '前提の仕組み', steps: ['手順', '空の `` がある'] }],
    ['steps[0]', { intro: '前提の仕組み', steps: ['空白だけの ` ` がある'] }],
  ])('調べ方の %s のコードの囲みが閉じていないか空なら拒否する', (path, approach) => {
    const pack = samplePack();
    pack.manifest.approach = approach;
    expect(validatePack(pack, { app })).toEqual([expect.stringContaining(`approach.${path}: コードは`)]);
  });

  it.each([null, '手順', ['手順']])('調べ方がオブジェクトでなければ拒否する', (approach) => {
    const pack = samplePack();
    Object.assign(pack.manifest, { approach });
    expect(validatePack(pack, { app }).some((error) => error.startsWith('approach'))).toBe(true);
  });

  it.each([null, '例', { title: '例' }])('仕組みの例がオブジェクトでなければ拒否する', (example) => {
    const pack = samplePack();
    Object.assign(pack.manifest.story, { workedExample: example });
    expect(validatePack(pack, { app }).some((error) => error.startsWith('story.workedExample'))).toBe(true);
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

describe('splitInlineCode', () => {
  it('バッククォートで囲んだ部分をコード、残りを地の文として、出てくる順に返す', () => {
    expect(splitInlineCode('まず `sudo -l` を実行し、`cat a.txt` と比べる')).toEqual([
      { code: false, text: 'まず ' },
      { code: true, text: 'sudo -l' },
      { code: false, text: ' を実行し、' },
      { code: true, text: 'cat a.txt' },
      { code: false, text: ' と比べる' },
    ]);
  });

  it('囲みのない文は、地の文 1 つとして返す', () => {
    expect(splitInlineCode('囲みのない文')).toEqual([{ code: false, text: '囲みのない文' }]);
  });

  it('文の先頭と末尾のコードの外側に、空の地の文を作らない', () => {
    expect(splitInlineCode('`whoami`')).toEqual([{ code: true, text: 'whoami' }]);
  });

  it.each(['`閉じていない', '前 `a` 後 `', '空の `` がある', '空白だけの `  ` がある'])('書き誤り「%s」は null を返す', (text) => {
    expect(splitInlineCode(text)).toBeNull();
  });
});

