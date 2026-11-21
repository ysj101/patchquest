// sudo の設定ミスのパックの開発用の検証データ。操作で直す課題は学習画面に対策候補を持たないので、解ける操作と誤った操作を
// 出荷前検証の候補として確かめる。再生する操作は {{キー}} を展開しないので、seed で変わる値を含まない形で書く。配布物には含めない
import { visudoSave } from '../../../apps/shell/scenario';
import type { ReplayEntry } from '../../../platform/contract';
import type { PackVerificationData } from '../../../tests/support/verification-data';

const COMMENT = '# 許可を外した';

/** 管理者として、運用担当向けの設定の行をコメントに書き換えて保存する。3 行目が注入された保守の操作の許可、2 行目が日常の運用操作の許可 */
export const disableLines = (...lines: number[]): ReplayEntry => ({ as: 'admin', request: visudoSave('/etc/sudoers.d/operators', lines.map((line) => ({ line, text: COMMENT }))) });

export const sudoMisconfigVerification: PackVerificationData = {
  packId: 'sudo-misconfig',
  implementations: {},
  candidates: [
    // 正しい修正：保守の操作の許可だけを外す
    { id: 'disable-maintenance', apply: [], replay: [disableLines(3)], expected: 'secure' },
    // 同じ修正を、設定のディレクトリへ移動してから相対パスで行う（記録に残る場所から再生できること）
    { id: 'disable-maintenance-relative', apply: [], replay: [{ as: 'admin', request: visudoSave('operators', [{ line: 3, text: COMMENT }], '/etc/sudoers.d') }], expected: 'secure' },
    // 絞りすぎ：日常の運用操作の許可まで、1 回の保存で外す
    { id: 'disable-everything', apply: [], replay: [disableLines(2, 3)], expected: 'breaks-normal' },
    // 絞りすぎ：同じことを 2 回の保存に分けて行う
    { id: 'disable-everything-in-two-saves', apply: [], replay: [disableLines(2), disableLines(3)], expected: 'breaks-normal' },
    // 取り違え：日常の運用操作の許可だけを外す。保守の操作は実行できるままで、普段の仕事は止まる
    { id: 'disable-operations-only', apply: [], replay: [disableLines(2)], expected: 'breaks-normal' },
    // 効果のない修正：設定の見出しだけを書き換える
    { id: 'edit-heading-only', apply: [], replay: [disableLines(1)], expected: 'insufficient' },
  ],
};
