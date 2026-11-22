// 教材アプリ「擬似シェル」。ブラウザ内のターミナルで、架空の機械の設定（第一弾は sudo）を調べて直す。
// bash を動かすのではなく、固定のコマンド集合を機械の状態に対して解釈する（任意のコードは実行しない）
import type { AppModule } from '../../runtimes/browser/app-module';
import { EVENT_LABELS, describeEvent, describeExchange, describeRequest } from './events';
import { ACTORS, shellFixture } from './fixtures';
import { BASELINE, HOOKS } from './hooks';
import { SCHEMA } from './schema';
import { handle } from './server';
import { SHELL_TESTS } from './tests';
import { terminalView } from './view';

export const shellApp: AppModule = {
  descriptor: {
    id: 'shell',
    version: '2.1.0',
    features: ['terminal', 'sudo'],
    users: [...ACTORS],
    entryRoute: '/terminal',
    hooks: HOOKS,
  },
  schema: SCHEMA,
  fixtures: { 'shell.default': shellFixture },
  implementations: BASELINE,
  tests: SHELL_TESTS,
  handle,
  render: terminalView('help と入力すると、使えるコマンドを表示します。'),
  describeEvent,
  eventLabels: Object.values(EVENT_LABELS),
  describeRequest,
  describeExchange,
  // 端末にコマンドを打てばどの操作も送れるので、リクエストを手で組む欄は出さない
  requestEditor: false,
};
