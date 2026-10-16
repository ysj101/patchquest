// 基盤の検証専用の課題パック。test-app のフックへ脆弱な実装を注入する。配布物には含めない
import type { MissionPack } from '../../platform/contract';
import type { ReadNote, RenderNote } from './test-app';

export const testPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'test-pack',
    version: '1.0.0',
    kind: 'mission',
    title: '検証用パック',
    summary: '基盤の検証に使う',
    learningObjectives: ['検証用'],
    estimatedMinutes: 5,
    vulnerability: { name: 'IDOR', fullName: '安全でない直接オブジェクト参照', cwe: 'CWE-639', category: 'authorization' },
    difficulty: 'beginner',
    story: {
      requester: {
        name: 'ノートの依頼人', role: 'ノートアプリの利用者',
        reactions: { reproduced: 'ほかの人のノートまで読めてしまうんだね。', secured: '守ってくれてありがとう。', closing: '誰のノートかを確かめるんだね。' },
      },
      workedExample: { title: '番号を変えると別の人のノートが返る', steps: ['入力：bob が GET /notes/1 を送る', '結果：alice のノートが返る'], takeaway: '誰のノートかを確かめていない' },
      incident: '他人のノートが見える', goal: '所有者だけが読めるようにする', protectedAssets: ['ノート本文'], normalUse: ['本人がノートを読める'] },
    appCompatibility: { appId: 'test-app', versions: '^1.0.0' },
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview'] },
    prerequisites: { features: ['notes'] },
    hooks: [
      { id: 'note.read', contract: 1 },
      { id: 'note.render', contract: 1 },
    ],
    conflicts: [],
    fixtures: { generator: 'test.default', variants: [{ id: 'default', label: '標準', recipe: 'any-owner' }] },
    mutationRecipes: [
      {
        id: 'any-owner',
        version: '1.0.0',
        appliesTo: { appId: 'test-app', versions: '^1.0.0', hooks: [{ id: 'note.read', contract: 1 }] },
        apply: [{ hook: 'note.read', implementation: 'test-pack/any-owner' }],
        verify: { probes: ['read-other'] },
        revert: 'baseline',
      },
    ],
    actions: [
      {
        id: 'read-note',
        label: 'ID 指定でノートを読む',
        description: 'ノートを ID で取得する',
        request: { method: 'GET', path: '/notes/{{field.id}}' },
        fields: [{ name: 'id', label: 'ノート ID', input: 'number' }],
        editable: true,
      },
    ],
    defenses: [
      {
        id: 'owner-only',
        label: '所有者を照合する',
        description: '取得時に所有者を照合する',
        apply: [{ hook: 'note.read', implementation: 'test-app/owner-only' }],
        referenceDiff: { file: 'notes.ts', language: 'ts', before: 'return note;', after: "return note.owner === principal ? note : 'forbidden';" },
        expected: 'secure',
      },
      {
        id: 'deny-all',
        label: 'すべて拒否する',
        description: 'ノートの取得をすべて拒否する',
        apply: [{ hook: 'note.read', implementation: 'test-pack/deny-all' }],
        referenceDiff: { file: 'notes.ts', language: 'ts', before: 'return note;', after: "return 'forbidden';" },
        expected: 'breaks-normal',
      },
      {
        id: 'display-only',
        label: '表示だけ変える',
        description: '表示を変えるだけでは直接の要求を防げない',
        apply: [{ hook: 'note.read', implementation: 'test-pack/any-owner' }],
        referenceDiff: { file: 'notes.ts', language: 'ts', before: 'return note;', after: 'return note; // 表示だけ変更' },
        expected: 'insufficient',
      },
    ],
    probes: [
      {
        id: 'read-other',
        title: 'bob が alice のノートを読める',
        steps: [
          {
            kind: 'request',
            as: 'bob',
            request: { method: 'GET', path: '/notes/{{notes.alice.id}}' },
            expect: { status: 200, body: [{ path: 'note.body', is: { equals: '{{notes.alice.body}}' } }] },
          },
        ],
        detect: {
          actor: { not: 'alice' },
          request: { method: 'GET', path: '/notes/*' },
          response: { status: 200, body: [{ path: 'note.owner', is: { equals: 'alice' } }] },
        },
      },
    ],
    tests: {
      target: ['test.read-other-denied'],
      cases: [
        {
          id: 'test.read-own',
          category: 'normal',
          title: '本人は自分のノートを読める',
          steps: [{ kind: 'request', as: 'alice', request: { method: 'GET', path: '/notes/{{notes.alice.id}}' }, expect: { status: 200 } }],
        },
        {
          id: 'test.read-other-denied',
          category: 'security',
          title: '他人のノートは読めない',
          steps: [{ kind: 'request', as: 'bob', request: { method: 'GET', path: '/notes/{{notes.alice.id}}' }, expect: { status: [403, 404] } }],
        },
        {
          id: 'test.render-no-script',
          category: 'security',
          title: 'ノートの本文はスクリプトとして実行されない',
          steps: [
            { kind: 'request', as: 'alice', request: { method: 'POST', path: '/notes', body: { body: '<img src="x" onerror="pqMarker()">' } }, expect: { status: 201 } },
            { kind: 'render', as: 'alice', view: { route: '/notes' }, events: [{ type: 'dom.marker', presence: 'absent' }] },
          ],
        },
        {
          id: 'test.anonymous-denied',
          category: 'security',
          title: '未ログインでは一覧を読めない',
          steps: [{ kind: 'request', as: 'anonymous', request: { method: 'GET', path: '/notes' }, expect: { status: 401 } }],
        },
      ],
    },
    hints: [
      { level: 1, text: 'ID を変えると何が返るか' },
      { level: 2, text: '別の利用者で同じ ID を要求する' },
      { level: 3, text: '取得時に所有者を照合する' },
    ],
    solution: 'note.read で所有者を照合する',
    transferCheck: [
      {
        id: 'q1',
        situation: 'carol が自分の ID を書き換えて要求した',
        prompt: '有効な対策はどれか',
        choices: [
          { id: 'owner', label: '取得時に所有者を照合する', correct: true, explanation: '処理側で照合すれば ID を変えても読めない' },
          { id: 'hide', label: '一覧のリンクを隠す', correct: false, explanation: '直接の要求は防げない' },
        ],
      },
    ],
    debrief: { cause: '所有者を照合していない', defenseRationale: '取得時に照合する', takeaways: ['画面ではなく処理で守る'] },
  },
  implementations: {
    'test-pack/any-owner': { hook: 'note.read', run: ((_ctx, note) => note) satisfies ReadNote },
    'test-pack/deny-all': { hook: 'note.read', run: (() => 'forbidden') satisfies ReadNote },
    'test-pack/html': { hook: 'note.render', run: ((el, body) => void (el.innerHTML = body)) satisfies RenderNote },
  },
};
