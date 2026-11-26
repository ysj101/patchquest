// 確かめない更新のパックの実装。注入するのは、配備時に、取り込みのプログラムが更新を動かす前に行う確認を決める処理（初期データ生成器が呼ぶ）。
// 安全な状態との差は、この処理が作る初期データ（取り込みのプログラムの中身）の差として入る
import { UPDATE_HOOK, type VerifyUpdate } from '../../apps/shell/linux/update';
import type { ImplementationRegistry } from '../../platform/contract';

/** 注入する問題：中身を確かめる行を「一時的に」外したまま、戻していない。残っているのは、外したときのメモだけ */
const verificationLeftOff: VerifyUpdate = () => ['# 2026-10-05 配布元の一覧の更新が遅れたので、中身を確かめる行を一時的に外した。あとで戻す'];

export const IMPLEMENTATIONS: ImplementationRegistry = {
  'unverified-update/verification-left-off': { hook: UPDATE_HOOK, run: verificationLeftOff },
};
