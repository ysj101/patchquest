// 教材アプリ「掲示板」。リクエストごとにページ（HTML）と応答ヘッダを返し、ブラウザが本物の HTTP 応答として開く（必要機能 http-pages）
import type { AppModule } from '../../runtimes/browser/app-module';
import { enhance } from './enhance';
import { EVENT_LABELS, describeEvent, describeExchange, describeRequest } from './events';
import { USERS, boardFixture } from './fixtures';
import { BASELINE, HOOKS } from './hooks';
import { SCHEMA } from './schema';
import { BOARD_ROUTE, handle } from './server';
import { BOARD_TESTS } from './tests';

export const boardApp: AppModule = {
  descriptor: {
    id: 'board',
    version: '1.0.0',
    features: ['pages', 'comments', 'response-headers'],
    users: [...USERS],
    entryRoute: BOARD_ROUTE,
    hooks: HOOKS,
  },
  schema: SCHEMA,
  fixtures: { 'board.default': boardFixture },
  implementations: BASELINE,
  tests: BOARD_TESTS,
  handle,
  pages: { enhance },
  describeEvent,
  eventLabels: Object.values(EVENT_LABELS),
  describeRequest,
  describeExchange,
  // 操作はページの中のリンクとフォームで行う。リクエストを手で組む欄は出さない
  requestEditor: false,
};
