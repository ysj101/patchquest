// メモの取り込みの、アプリ共通のテスト。安全な基準状態 S ではすべて通る（spec A01）。
// 合否は、応答の中身と、パーサーが実際に読んだ資源のバイト数で決める
import type { EventExpectation, TestCase } from '../../platform/contract';
import { ENTITY_MEMO, ENTITY_XML, PLAIN_MEMO, PLAIN_XML, SERVER_FILES, externalEntityXml } from './import-xml';

const IMPORT = { method: 'POST', path: '/api/import' } as const;

/** サーバの中のファイルを、パーサーへ 1 バイトも渡していない。取り込みを断って解析しなかったときも満たす */
export const NO_FILE_LOADED: EventExpectation = { type: 'xml.parse', where: [{ path: 'loadedBytes', is: { notEquals: 0 } }], presence: 'absent' };

export const IMPORT_TESTS: TestCase[] = [
  {
    id: 'import.plain',
    category: 'normal',
    title: 'XML からメモを取り込み、取り込んだ本人が読める',
    steps: [
      {
        kind: 'request',
        as: 'alice',
        request: { ...IMPORT, body: { xml: PLAIN_XML } },
        expect: { status: 201, body: [{ path: 'imported', is: { minLength: 1 } }, { path: 'imported.0.title', is: { equals: PLAIN_MEMO.title } }] },
        capture: { id: 'imported.0.id' },
      },
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'GET', path: '/api/memos/{{capture.id}}' },
        expect: { status: 200, body: [{ path: 'memo.body', is: { equals: PLAIN_MEMO.body } }, { path: 'memo.ownerId', is: { equals: '{{users.alice.id}}' } }] },
      },
    ],
  },
  {
    id: 'import.internal-entity',
    category: 'normal',
    title: '文書の中で決めた実体は、決めた文字に置き換わる',
    steps: [
      {
        kind: 'request',
        as: 'bob',
        request: { ...IMPORT, body: { xml: ENTITY_XML } },
        expect: { status: 201, body: [{ path: 'imported.0.body', is: { equals: ENTITY_MEMO.body } }] },
      },
    ],
  },
  {
    id: 'import.malformed',
    category: 'normal',
    title: '閉じていない XML は断り、何も保存しない',
    steps: [
      {
        kind: 'request',
        as: 'carol',
        request: { ...IMPORT, body: { xml: '<memos><memo><title>途中まで</title>' } },
        expect: { status: 400 },
      },
      {
        kind: 'request',
        as: 'carol',
        request: { method: 'GET', path: '/api/memos' },
        expect: { status: 200, body: [{ path: 'memos', is: { notContains: '途中まで' } }] },
      },
    ],
  },
  {
    id: 'import.unauthenticated',
    category: 'security',
    title: 'ログインしていないと取り込めない',
    steps: [{ kind: 'request', as: 'anonymous', request: { ...IMPORT, body: { xml: PLAIN_XML } }, expect: { status: 401 }, events: [{ type: 'xml.parse', presence: 'absent' }] }],
  },
  {
    id: 'import.external-entity',
    category: 'security',
    title: 'サーバの設定ファイルを指す実体を書いても、中身は取り込まれない',
    steps: [
      {
        kind: 'request',
        as: 'alice',
        request: { ...IMPORT, body: { xml: externalEntityXml(`file://${SERVER_FILES.env}`) } },
        expect: { body: [{ path: '', is: { notContains: '{{server.env.password}}' } }] },
        events: [NO_FILE_LOADED],
      },
    ],
  },
];
