// 確かめない更新のパックの実装。注入するのは、配備時に更新の取り込みの設定を決める処理（初期データ生成器が呼ぶ）。
// 設定ミスはコードのバグではないので、安全な状態との差は、この処理が作る初期データ（設定ファイルの中身）の差として入る
import { UPDATE_HOOK, type ConfigureUpdate } from '../../apps/shell/linux/update';
import type { ImplementationRegistry } from '../../platform/contract';

/** 注入する設定ミス：中身の確認を「一時的に」切ったまま、戻していない */
const verificationLeftOff: ConfigureUpdate = () => ['# 2026-10-05 配布元の一覧の更新が遅れたので、一時的に切った。あとで戻す', 'verify=off'];

export const IMPLEMENTATIONS: ImplementationRegistry = {
  'unverified-update/verification-left-off': { hook: UPDATE_HOOK, run: verificationLeftOff },
};
