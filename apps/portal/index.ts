// 教材アプリ「社内ポータル」。画面を、Service Worker が返す本物の HTTP 応答として出す（必要機能 http）。
// サインインと、サインインのあとに もとのページへ戻るリダイレクトを持つ
import type { AppModule } from '../../runtimes/browser/app-module';
import { EVENT_LABELS, describeEvent, describeExchange } from './events';
import { USERS, portalFixture } from './fixtures';
import { BASELINE, HOME, HOOKS } from './hooks';
import { SCHEMA } from './schema';
import { handle } from './server';
import { PORTAL_TESTS } from './tests';

export const portalApp: AppModule = {
  descriptor: {
    id: 'portal',
    version: '1.0.0',
    features: ['signin', 'notices'],
    users: [...USERS],
    entryRoute: HOME,
    hooks: HOOKS,
  },
  schema: SCHEMA,
  fixtures: { 'portal.default': portalFixture },
  implementations: BASELINE,
  tests: PORTAL_TESTS,
  handle,
  http: true,
  describeEvent,
  describeExchange,
  eventLabels: Object.values(EVENT_LABELS),
  // 操作はすべて、教材アプリの画面（リンク・フォーム・アドレス欄）から行う。画面を通すと、ブラウザが応答に従うところまで見える
  requestEditor: false,
};
