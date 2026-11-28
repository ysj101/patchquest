// 教材アプリ「メモ帳」。非公開メモの CRUD・共有ページ・検索・XML からの取り込みと、演習ハーネスによる利用者の切り替えを持つ
import type { AppModule } from '../../runtimes/browser/app-module';
import { EVENT_LABELS, describeEvent, describeExchange } from './events';
import { USERS, memoFixture } from './fixtures';
import { BASELINE, HOOKS } from './hooks';
import { IMPORT_TESTS } from './import-tests';
import { SCHEMA } from './schema';
import { handle } from './server';
import { MEMO_TESTS } from './tests';
import { render } from './view';

export const memoApp: AppModule = {
  descriptor: {
    id: 'memo',
    version: '1.4.0',
    features: ['memo', 'comments', 'search', 'import'],
    users: [...USERS],
    entryRoute: '/memos',
    hooks: HOOKS,
  },
  schema: SCHEMA,
  fixtures: { 'memo.default': memoFixture },
  implementations: BASELINE,
  tests: [...MEMO_TESTS, ...IMPORT_TESTS],
  handle,
  render,
  describeEvent,
  describeExchange,
  eventLabels: Object.values(EVENT_LABELS),
};
