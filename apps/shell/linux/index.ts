// 教材アプリ「Linux 端末」。擬似シェルと同じ端末の画面・同じ初期データで、中身だけを本物の Linux に替えたもの。
// コマンドは、WASM のエミュレータ（v86）の中で起動した Alpine Linux が実行する。sudo の判断も本物の sudo が行う（spec §14）
import type { AppModule } from '../../../runtimes/browser/app-module';
import { EVENT_LABELS, describeExchange, describeExpectation, describeRequest, isBackground } from '../events';
import { ACTORS, machineFixture } from '../fixtures';
import { SCHEMA } from '../schema';
import { SHELL_TESTS } from '../tests';
import { terminalView } from '../view';
import { describeEvent } from './events';
import { BASELINE, HOOKS, PROVISION_HOOK } from './hooks';
import { provision, reset } from './provision';
import { handle } from './server';
import { updateAddition } from './update';

export const linuxApp: AppModule = {
  descriptor: {
    id: 'linux',
    version: '1.5.0',
    features: ['terminal', 'sudo', 'update'],
    users: [...ACTORS],
    entryRoute: '/terminal',
    hooks: HOOKS,
  },
  // 初期データは擬似シェルと同じ表に作り、それを機械へ反映する。同じ seed なら、擬似シェルと同じ顔ぶれの機械になる
  schema: SCHEMA,
  // linux.update は、同じ機械に更新の取り込み（置き場・取り込むプログラム・中身を確かめる設定）を足したもの
  fixtures: { 'linux.default': machineFixture(PROVISION_HOOK), 'linux.update': machineFixture(PROVISION_HOOK, updateAddition) },
  implementations: BASELINE,
  // 擬似シェルと同じテストが、本物の Linux でも通る
  tests: SHELL_TESTS,
  handle,
  // 本物のシェルの help は組み込みコマンドの一覧を出すだけなので、よく使うコマンドの案内に差し替えてある（guest/help）
  render: terminalView('help と入力すると、よく使うコマンドを表示します。ls・cat・grep などのコマンドやパイプ（|）もそのまま使えます。vi や less のように画面全体を使うプログラムは動きません。'),
  machine: { provision, reset },
  describeEvent,
  // 観測イベントの種類と項目名は擬似シェルと同じ（ファイルの変更だけ、行番号を持たない説明にしている）
  eventLabels: Object.values(EVENT_LABELS),
  describeRequest,
  describeExpectation,
  describeExchange,
  isBackground,
  requestEditor: false,
};
