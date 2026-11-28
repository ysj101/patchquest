// 教材アプリ「メモ帳」。非公開メモの CRUD と、共有ページのコメント・スタンプ、演習ハーネスによる利用者の切り替えを持つ
import type { AppModule } from '../../runtimes/browser/app-module';
import { EVENT_LABELS, describeEvent } from './events';
import { USERS, memoFixture } from './fixtures';
import { BASELINE, HOOKS } from './hooks';
import { SCHEMA } from './schema';
import { handle } from './server';
import { EMBEDS } from './stamp-view';
import { MEMO_TESTS } from './tests';
import { render } from './view';

export const memoApp: AppModule = {
  descriptor: {
    id: 'memo',
    version: '1.4.0',
    features: ['memo', 'comments', 'search', 'stamps'],
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
  embeds: EMBEDS,
  describeEvent,
  eventLabels: Object.values(EVENT_LABELS),
};
