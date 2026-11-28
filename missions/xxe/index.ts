// ミッション「XML の取り込みで、サーバのファイルが混ざるのを防ぐ」（XXE、CWE-611。Issue #239）。
// メモの取り込みが XML のパーサー（libxml2）を、外部実体まで読みに行くオプションで呼び出す実装へ切り替える。
// パーサーは本物の libxml2（WASM）。読ませるファイルは、初期データがメモリの中に作った架空のものだけ
import type { MissionPack, ReferenceDiff } from '../../platform/contract';
import { ENTITY_XML, PLAIN_XML, SERVER_FILES, externalEntityXml } from '../../apps/memo/import-xml';
import { IMPLEMENTATIONS } from './implementations';
import { APPROACH, DEBRIEF, HINTS, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { PROBES, TARGET_CASES } from './tests';

const PARSE = { id: 'memo.import.parse', contract: 1 };
const TARGET_APP = { appId: 'memo', versions: '^1.4.0' };
const RECIPE = 'noent-import';

/** 参考差分。parse は libxml2 を呼び出す関数で、第 2 引数がパーサーのオプション */
const diff = (after: string): ReferenceDiff => ({
  file: 'apps/memo/hooks.ts',
  language: 'ts',
  before: `const parseImport = (parse, source) =>
  parse(source, XML_PARSE_NOENT);`,
  after,
});

export const xxePack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'xxe',
    version: '1.0.0',
    kind: 'mission',
    title: 'XML の取り込みで、サーバのファイルが混ざるのを防ぐ',
    estimatedMinutes: 15,
    vulnerability: {
      name: 'XXE',
      plain: '取り込む XML に細工をすると、サーバの中のファイルまで読み出せてしまう問題',
      fullName: 'XML 外部実体参照の不適切な制限',
      cwe: 'CWE-611',
      category: 'misconfiguration',
    },
    difficulty: 'advanced',
    summary: 'メモを XML から取り込む機能で、サーバの設定ファイルの中身がメモに入るという報告を調べます。XML を読むプログラムの呼び出し方を直します。',
    learningObjectives: [
      'XML の実体（名前を付けた置き換え）を使って、サーバのファイルの中身がメモに入ることを再現できる',
      '「ネットワークからの読み込みを禁じる」と「外部実体の読み込みを禁じる」の違いを説明できる',
      '対策のあと、ふつうの XML と、文書の中で決めた実体は、今までどおり取り込めると確かめられる',
    ],
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: { name: 'carol さん', role: 'メモアプリの利用者' },
      incident:
        '利用者の carol さんから報告がありました。「メモの取り込みで、XML の書き方を少し変えたら、サーバの設定ファイルの中身がメモの本文に入りました。メール用のパスワードまで読めてしまいます」',
      goal: '取り込む XML に何が書いてあっても、サーバの中のファイルは読ませません。ふつうの XML は、今までどおり取り込めます。',
      protectedAssets: ['サーバの中のファイル（設定ファイルのパスワードなど）'],
      normalUse: ['XML からメモを取り込める', '文書の中で決めた実体は置き換わる', '閉じていない XML は断る'],
    },
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview', 'libxml2'] },
    appCompatibility: TARGET_APP,
    prerequisites: { features: ['import'] },
    conflicts: [],
    hooks: [PARSE],
    fixtures: { generator: 'memo.default', variants: [{ id: 'import', label: '取り込み', recipe: RECIPE }] },
    mutationRecipes: [
      {
        id: RECIPE,
        version: '1.0.0',
        apply: [{ hook: PARSE.id, implementation: 'xxe/import-noent' }],
        verify: { probes: PROBES.map((probe) => probe.id) },
        revert: 'baseline',
        appliesTo: { ...TARGET_APP, hooks: [PARSE] },
      },
    ],
    probes: PROBES,
    tests: {
      target: ['import.external-entity', ...TARGET_CASES.map((test) => test.id)],
      cases: TARGET_CASES,
    },
    approach: APPROACH,
    actions: [
      {
        id: 'import-registered',
        label: '登録済みの XML を取り込む',
        description: '表示中の利用者として、メモの取り込みに XML を送ります。送った XML は、観測ログの記録を開くと「取り込んだ XML」に出ます。',
        request: { method: 'POST', path: '/api/import', body: { xml: '{{field.xml}}' } },
        fields: [
          {
            name: 'xml',
            label: '登録済みの XML',
            input: 'select',
            options: [
              { value: PLAIN_XML, label: 'ふつうの XML' },
              { value: ENTITY_XML, label: '実体を使う XML' },
            ],
          },
        ],
        editable: false,
      },
      {
        id: 'import-server-file',
        label: 'サーバのファイルを指す XML を取り込む',
        description:
          '実体の宣言に SYSTEM で場所を書いた XML を送ります。サーバの中のファイルは、この教材がメモリの中に作った架空のものです。本物のファイルやネットワークには届きません。',
        request: { method: 'POST', path: '/api/import', body: { xml: externalEntityXml('{{field.path}}') } },
        fields: [
          {
            name: 'path',
            label: '読ませるファイルの場所',
            input: 'text',
            default: SERVER_FILES.hostname,
            help: `サーバの中の場所を、/ から書きます。${SERVER_FILES.hostname} はサーバの名前、${SERVER_FILES.env} はアプリの設定ファイルです。file:// を前に付けた書き方でも、同じ場所を指します。`,
          },
        ],
        editable: false,
      },
    ],
    defenses: [
      {
        id: 'no-xxe',
        label: '外部実体の読み込みを禁じるオプション（XML_PARSE_NO_XXE）を足す',
        description: 'パーサーは、XML の中に SYSTEM で場所が書いてあっても、その資源を開かなくなります。文書の中で決めた実体は、今までどおり置き換わります。',
        apply: [{ hook: PARSE.id, implementation: 'memo/import-no-xxe' }],
        referenceDiff: diff(`const parseImport = (parse, source) =>
  parse(source, XML_PARSE_NOENT | XML_PARSE_NO_XXE);`),
        expected: 'secure',
      },
      {
        id: 'nonet',
        label: 'ネットワークからの読み込みを禁じるオプション（XML_PARSE_NONET）を足す',
        description: 'パーサーは、http:// などで始まる、ネットワークの先の資源を読まなくなります。',
        apply: [{ hook: PARSE.id, implementation: 'xxe/import-nonet' }],
        referenceDiff: diff(`const parseImport = (parse, source) =>
  parse(source, XML_PARSE_NOENT | XML_PARSE_NONET);`),
        whyItFails: 'サーバの中のファイルは、ネットワークを通らずに開けるので、そのまま読まれてメモに入りました。',
        expected: 'insufficient',
      },
      {
        id: 'disable-import',
        label: '取り込みを止める',
        description: 'どんな XML も、パーサーに渡さずに断ります。サーバのファイルは読まれませんが、メモも取り込めなくなります。',
        apply: [{ hook: PARSE.id, implementation: 'xxe/import-disabled' }],
        referenceDiff: diff(`const parseImport = () =>
  ({ ok: false, error: '取り込みは停止しています', resources: [] });`),
        whyItFails: 'サーバのファイルは読まれなくなりましたが、ふつうの XML も取り込めなくなりました。',
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
