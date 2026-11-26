// 確かめない更新のパックの開発用の検証データ。操作で直す課題は学習画面に対策候補を持たないので、解ける操作と誤った操作を
// 出荷前検証の候補として確かめる。再生する操作は {{キー}} を展開しないので、seed で変わる値を含まない形で書く。配布物には含めない
import { sudoeditSave, visudoSave } from '../../../apps/shell/scenario';
import type { LineEdit } from '../../../apps/shell/edits';
import type { ReplayEntry } from '../../../platform/contract';
import type { PackVerificationData } from '../../../tests/support/verification-data';

const APPLY = '/usr/local/bin/apply-update';
const CHECK = 'sha256sum -c /etc/updates/SHA256SUMS';

/** 管理者として、コマンド行を 1 つ実行する */
const asAdmin = (line: string): ReplayEntry => ({ as: 'admin', request: { method: 'POST', path: '/sh', body: { line } } });

/**
 * 管理者として、取り込みのプログラムを sudoedit で編集して保存する。1〜4 行目は実行の記録など、5 行目が置き場へ移る行、
 * 6 行目が確かめる行を外したときのメモ、7 行目が更新を動かす行
 */
const editApply = (...edits: LineEdit[]): ReplayEntry => ({ as: 'admin', request: sudoeditSave(APPLY, edits) });

export const unverifiedUpdateVerification: PackVerificationData = {
  packId: 'unverified-update',
  implementations: {},
  // 直す対象（開くコマンド・行）と、書く内容・直す人（管理者）。調べ方と操作のしかたには書かない
  answerTerms: [`sudoedit ${APPLY}`, '6 行目', `${CHECK} || exit 1`, 'admin'],
  candidates: [
    // 正しい修正：メモの行を、ハッシュを確かめて、合わなければやめる行に書き換える
    { id: 'check-or-exit', apply: [], replay: [editApply({ line: 6, text: `${CHECK} || exit 1` })], expected: 'secure' },
    // 同じ修正を、メモを残したまま、その下に行を足して行う
    { id: 'check-added-below-note', apply: [], replay: [editApply({ after: 6, text: `${CHECK} || exit 1` })], expected: 'secure' },
    // 同じ修正を、if で書く
    { id: 'check-with-if', apply: [], replay: [editApply({ line: 6, text: `if ! ${CHECK}; then exit 1; fi` })], expected: 'secure' },
    // 同じ修正を、確かめる行と動かす行を && でつないで行う
    { id: 'check-and-run', apply: [], replay: [editApply({ line: 7, text: `${CHECK} && sh ./update.sh` })], expected: 'secure' },
    // 足りない修正：確かめるが、合わなくてもやめない。合わないと表示したあとで、更新を動かしてしまう
    { id: 'check-without-exit', apply: [], replay: [editApply({ line: 6, text: CHECK })], expected: 'insufficient' },
    // 足りない修正：ハッシュを確かめず、更新に保守の操作の置き場（/usr/local/sbin/）が書いてあるときだけやめる。ほかの書き換えは、そのまま取り込まれる
    { id: 'reject-known-text-only', apply: [], replay: [editApply({ after: 6, text: 'grep -q /usr/local/sbin/ update.sh && exit 1' })], expected: 'insufficient' },
    // 足りない修正：ハッシュを確かめず、更新の行数が配布元の出したものと同じ（3 行）かだけを見る。行数を変えない書き換えは、そのまま取り込まれる
    { id: 'count-lines-only', apply: [], replay: [editApply({ after: 6, text: '[ "$(wc -l < update.sh)" = 3 ] || exit 1' })], expected: 'insufficient' },
    // 足りない修正：置き場の更新を、運用担当が書き換えられないようにするだけ。配布元で書き換えられた更新は、そのまま取り込まれる
    { id: 'lock-cache-only', apply: [], replay: [asAdmin('sudo chown -R root /var/cache/updates')], expected: 'insufficient' },
    // 止めすぎ：置き場へ移る前に確かめる。一覧のファイル名は置き場から見た名前なので、正しい更新も見つからずに止まる
    { id: 'check-before-cd', apply: [], replay: [editApply({ after: 4, text: `${CHECK} || exit 1` })], expected: 'breaks-normal' },
    // 止めすぎ：運用担当の sudo の許可（2 行目）を外して、取り込みそのものをできなくする
    { id: 'revoke-apply', apply: [], replay: [{ as: 'admin', request: visudoSave('/etc/sudoers.d/operators', [{ line: 2, text: '# 許可を外した' }]) }], expected: 'breaks-normal' },
    // 止めすぎ：確かめる行を入れたうえで、一覧を空にする。正しい更新も一覧と合わなくなる
    { id: 'check-with-empty-list', apply: [], replay: [editApply({ line: 6, text: `${CHECK} || exit 1` }), asAdmin("sudo sh -c ': > /etc/updates/SHA256SUMS'")], expected: 'breaks-normal' },
  ],
};
