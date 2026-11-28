// XXE パックの攻撃の成立条件とテスト。合否は、応答に seed ごとの目印（設定ファイルのパスワード・サーバの名前）が混ざったかと、
// パーサーが実際に読んだ資源のバイト数で決め、選んだ対策の ID では決めない。ふつうの取り込みの正常系は、アプリ共通のテストが確かめる
import type { ActorKey, ProbeDef, TestCase } from '../../platform/contract';
import { NO_FILE_LOADED } from '../../apps/memo/import-tests';
import { SERVER_FILES, externalEntityXml, parameterEntityXml } from '../../apps/memo/import-xml';

const IMPORT = { method: 'POST', path: '/api/import' } as const;

/** 設定ファイルを、file: の URI で指す XML。調査の操作の初期値とは別の書き方も、テストで確かめる */
export const ENV_URI = `file://${SERVER_FILES.env}`;

/** xml を取り込んでも、応答に secret（fixture の値）が混ざらず、パーサーはサーバのファイルを 1 バイトも読まない */
function guarded(actor: ActorKey, xml: string, secret: string): TestCase['steps'][number] {
  return {
    kind: 'request',
    as: actor,
    request: { ...IMPORT, body: { xml } },
    expect: { body: [{ path: '', is: { notContains: secret } }] },
    events: [NO_FILE_LOADED],
  };
}

const PASSWORD = '{{server.env.password}}';
const HOSTNAME = '{{server.hostname}}';

export const PROBES: ProbeDef[] = [
  {
    id: 'read-env',
    title: '取り込んだメモの本文に、サーバの設定ファイルのパスワードが入る',
    steps: [
      {
        kind: 'request',
        as: 'bob',
        request: { ...IMPORT, body: { xml: externalEntityXml(ENV_URI) } },
        expect: { status: 201, body: [{ path: 'imported', is: { contains: PASSWORD } }] },
        events: [{ type: 'xml.parse', where: [{ path: 'resources.0.uri', is: { equals: ENV_URI } }, { path: 'loadedBytes', is: { notEquals: 0 } }] }],
      },
    ],
    // だれが取り込んでも、パスワードが応答に入れば再現とみなす
    detect: {
      kind: 'request',
      request: { method: 'POST', path: '/api/import' },
      response: { status: 201, body: [{ path: 'imported', is: { contains: PASSWORD } }] },
    },
  },
];

/** 攻撃阻止。場所の書き方やファイルを変えても、サーバのファイルは読まれない */
export const TARGET_CASES: TestCase[] = [
  {
    id: 'xxe.plain-path',
    category: 'security',
    title: 'file: を付けずに場所だけを書いても、設定ファイルは読まれない',
    steps: [guarded('bob', externalEntityXml(SERVER_FILES.env), PASSWORD)],
  },
  {
    id: 'xxe.relative-path',
    category: 'security',
    title: '取り込んだ XML の置き場からたどる書き方でも、設定ファイルは読まれない',
    steps: [guarded('carol', externalEntityXml('../.env'), PASSWORD)],
  },
  {
    id: 'xxe.other-file',
    category: 'security',
    title: '設定ファイルのほかのファイルも読まれない',
    steps: [guarded('alice', externalEntityXml(`file://${SERVER_FILES.hostname}`), HOSTNAME)],
  },
  {
    id: 'xxe.parameter-entity',
    category: 'security',
    title: '本文に出ない書き方（パラメーター実体）でも、ファイルは読まれない',
    steps: [guarded('bob', parameterEntityXml(`file://${SERVER_FILES.hostname}`), HOSTNAME)],
  },
];
