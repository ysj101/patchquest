// 教材アプリ「メモ帳」。非公開メモの CRUD と、演習ハーネスによる利用者の切り替えを持つ
import type { AppModule } from '../../runtimes/browser/app-module';
import { describeEvent } from './events';
import { USERS, memoFixture } from './fixtures';
import { BASELINE, HOOKS } from './hooks';
import { SCHEMA } from './schema';
import { handle } from './server';
import { MEMO_TESTS } from './tests';
import { render } from './view';

export const memoApp: AppModule = {
  descriptor: {
    id: 'memo',
    version: '1.0.0',
    features: ['memo', 'comments', 'search'],
    users: [...USERS],
    entryRoute: '/memos',
    hooks: HOOKS,
  },
  schema: SCHEMA,
  fixtures: { 'memo.default': memoFixture },
  implementations: BASELINE,
  tests: MEMO_TESTS,
  handle,
  render,
  describeEvent,
};
