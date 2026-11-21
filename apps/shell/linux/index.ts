// 教材アプリ「Linux 端末」。擬似シェルと同じ端末の画面・同じ初期データで、中身だけを本物の Linux に替えたもの。
// コマンドは、WASM のエミュレータ（v86）の中で起動した Alpine Linux が実行する。sudo の判断も本物の sudo が行う（spec §14）
import type { AppModule } from '../../../runtimes/browser/app-module';
import { describeExchange, describeRequest } from '../events';
import { ACTORS, machineFixture } from '../fixtures';
import { SCHEMA } from '../schema';
import { SHELL_TESTS } from '../tests';
import { terminalView } from '../view';
import { describeEvent } from './events';
import { BASELINE, HOOKS, PROVISION_HOOK } from './hooks';
import { provision, reset } from './provision';
import { handle } from './server';

export const linuxApp: AppModule = {
  descriptor: {
    id: 'linux',
    version: '1.0.0',
    features: ['terminal', 'sudo'],
    users: [...ACTORS],
    entryRoute: '/terminal',
    hooks: HOOKS,
  },
  // 初期データは擬似シェルと同じ表に作り、それを機械へ反映する。同じ seed なら、擬似シェルと同じ顔ぶれの機械になる
  schema: SCHEMA,
  fixtures: { 'linux.default': machineFixture(PROVISION_HOOK) },
  implementations: BASELINE,
  // 擬似シェルと同じテストが、本物の Linux でも通る
  tests: SHELL_TESTS,
  handle,
  // 本物のシェルの help は組み込みコマンドの一覧を出すだけなので勧めない。画面全体を使うプログラム（vi など）は入力を受け取れない
  render: terminalView('Linux の端末です。ls・cat・sudo などのコマンドをそのまま使えます（vi のように画面全体を使うプログラムは動きません）。↑↓ キーで前に入力したコマンドを呼び出せます。'),
  machine: { provision, reset },
  describeEvent,
  describeRequest,
  describeExchange,
  requestEditor: false,
};
