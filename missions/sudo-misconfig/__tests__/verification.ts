// sudo の設定ミスのパックの開発用の検証データ。操作で直す課題は学習画面に対策候補を持たないので、解ける操作と誤った操作を
// 出荷前検証の候補として確かめる。再生する操作は {{キー}} を展開しないので、seed で変わる値を含まない形で書く。配布物には含めない
import type { ReplayEntry } from '../../../platform/contract';
import type { PackVerificationData } from '../../../tests/support/verification-data';

const sh = (as: string, line: string, cwd?: string): ReplayEntry => ({ as, request: { method: 'POST', path: '/sh', body: { line, ...(cwd !== undefined && { cwd }) } } });

/** 管理者として、運用担当向けの設定の 1 行をコメントに書き換える。3 行目が注入された保守の操作の許可、2 行目が日常の運用操作の許可 */
export const disableLine = (line: number): ReplayEntry => sh('admin', `sudo edit /etc/sudoers.d/operators ${line} '# 許可を外した'`);

export const sudoMisconfigVerification: PackVerificationData = {
  packId: 'sudo-misconfig',
  implementations: {},
  candidates: [
    // 正しい修正：保守の操作の許可だけを外す
    { id: 'disable-maintenance', apply: [], replay: [disableLine(3)], expected: 'secure' },
    // 同じ修正を、設定のディレクトリへ移動してから相対パスで行う（記録に残る場所から再生できること）
    { id: 'disable-maintenance-relative', apply: [], replay: [sh('admin', "sudo edit operators 3 '# 許可を外した'", '/etc/sudoers.d')], expected: 'secure' },
    // 絞りすぎ：日常の運用操作の許可まで外す
    { id: 'disable-everything', apply: [], replay: [disableLine(2), disableLine(3)], expected: 'breaks-normal' },
    // 取り違え：日常の運用操作の許可だけを外す。保守の操作は実行できるままで、普段の仕事は止まる
    { id: 'disable-operations-only', apply: [], replay: [disableLine(2)], expected: 'breaks-normal' },
    // 効果のない修正：設定の見出しだけを書き換える
    { id: 'edit-heading-only', apply: [], replay: [disableLine(1)], expected: 'insufficient' },
    // 効果のない修正：運用メモから保守の操作の記述を消す。設定は残っているので実行できる
    { id: 'edit-runbook-only', apply: [], replay: [sh('operator', 'edit runbook.txt 4 保守の操作は行わない')], expected: 'insufficient' },
  ],
};
