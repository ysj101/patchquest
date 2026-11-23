// 確かめない更新のパックの開発用の検証データ。操作で直す課題は学習画面に対策候補を持たないので、解ける操作と誤った操作を
// 出荷前検証の候補として確かめる。再生する操作は {{キー}} を展開しないので、seed で変わる値を含まない形で書く。配布物には含めない
import { sudoeditSave, visudoSave } from '../../../apps/shell/scenario';
import type { ReplayEntry } from '../../../platform/contract';
import type { PackVerificationData } from '../../../tests/support/verification-data';

/** 管理者として、コマンド行を 1 つ実行する */
const asAdmin = (line: string): ReplayEntry => ({ as: 'admin', request: { method: 'POST', path: '/sh', body: { line } } });

/** 管理者として、設定の 5 行目（注入された verify=off）を sudoedit で書き換えて保存する。1〜3 行目は説明、4 行目は切った理由のコメント */
const setVerifyLine = (text: string): ReplayEntry => ({ as: 'admin', request: sudoeditSave('/etc/update.conf', [{ line: 5, text }]) });

const VERIFY_ON = setVerifyLine('verify=on');

export const unverifiedUpdateVerification: PackVerificationData = {
  packId: 'unverified-update',
  implementations: {},
  // 直す対象（ファイル・行）と、直し方・直す人（管理者）。調べ方と操作のしかたには書かない
  answerTerms: ['/etc/update.conf', '5 行目', 'verify=on', 'admin'],
  candidates: [
    // 正しい修正：中身の確認を有効にする
    { id: 'verify-on', apply: [], replay: [VERIFY_ON], expected: 'secure' },
    // 同じ修正を、確認を切る行をコメントにして行う（切る指定がなければ、確認する）
    { id: 'comment-out-verify-off', apply: [], replay: [setVerifyLine('# verify=off')], expected: 'secure' },
    // 同じ修正を、編集画面を使わずに、設定のファイルを直接書き換えて行う
    { id: 'verify-on-with-sed', apply: [], replay: [asAdmin("sudo sed -i 's/^verify=off$/verify=on/' /etc/update.conf")], expected: 'secure' },
    // 足りない修正：置き場の更新を、運用担当が書き換えられないようにするだけ。配布元で書き換えられた更新は、そのまま取り込まれる
    { id: 'lock-cache-only', apply: [], replay: [asAdmin('sudo chown -R root /var/cache/updates')], expected: 'insufficient' },
    // 止めすぎ：運用担当の sudo の許可（2 行目）を外して、取り込みそのものをできなくする
    { id: 'revoke-apply', apply: [], replay: [{ as: 'admin', request: visudoSave('/etc/sudoers.d/operators', [{ line: 2, text: '# 許可を外した' }]) }], expected: 'breaks-normal' },
    // 止めすぎ：確認を有効にしたうえで、一覧を空にする。正しい更新も一覧と合わなくなる
    { id: 'verify-on-with-empty-list', apply: [], replay: [VERIFY_ON, asAdmin("sudo sh -c ': > /etc/update.sums'")], expected: 'breaks-normal' },
  ],
};
