// 履歴に残った鍵のパックの開発用の検証データ。操作で直す課題は学習画面に対策候補を持たないので、解ける操作と誤った操作を
// 出荷前検証の候補として確かめる。再生する操作は {{キー}} を展開しないので、seed で変わる値を含まない形で書く
// （場所を付けない操作は、その利用者のホームから始まる）。配布物には含めない
import { sudoeditSave } from '../../../apps/shell/scenario';
import type { ReplayEntry } from '../../../platform/contract';
import type { PackVerificationData } from '../../../tests/support/verification-data';

const KEYS = '/home/deploy/.ssh/authorized_keys';
const NEW_PUBLIC_KEY = 'new_deploy_key.pub';

const run = (as: string, line: string): ReplayEntry => ({ as, request: { method: 'POST', path: '/sh', body: { line } } });
/** 管理者として、コマンド行を 1 つ実行する */
const asAdmin = (line: string): ReplayEntry => run('admin', line);
/** 運用担当として、リポジトリ（~/app）に git のコマンドを実行する */
const inRepo = (...commands: string[]): ReplayEntry => run('operator', commands.map((command) => `git -C app ${command}`).join(' && '));

/** 管理者が、自分のホームに新しい鍵を作る */
const NEW_KEY = asAdmin("ssh-keygen -q -t ed25519 -N '' -f ~/new_deploy_key");
/** 新しい公開鍵を、古い鍵の登録を残したまま、一覧の末尾に足す */
const APPEND = asAdmin(`cat ~/${NEW_PUBLIC_KEY} | sudo tee -a ${KEYS}`);

export const leakedKeyVerification: PackVerificationData = {
  packId: 'leaked-key',
  implementations: {},
  // 直し方（登録を新しい公開鍵に入れ替えるコマンド）と、直す人（管理者）。調べ方と操作のしかたには書かない
  answerTerms: [`sudo tee ${KEYS}`, NEW_PUBLIC_KEY, 'admin'],
  candidates: [
    // 正しい修正：新しい鍵を作り、登録を新しい公開鍵に入れ替える
    { id: 'rotate-and-replace', apply: [], replay: [NEW_KEY, asAdmin(`cat ~/${NEW_PUBLIC_KEY} | sudo tee ${KEYS}`)], expected: 'secure' },
    // 同じ修正を、新しい公開鍵を足してから、古い鍵の行（1 行目）を編集画面で消して行う
    { id: 'append-then-remove-old', apply: [], replay: [NEW_KEY, APPEND, { as: 'admin', request: sudoeditSave(KEYS, [{ line: 1, remove: true }]) }], expected: 'secure' },
    // 足りない修正：新しい鍵を足すだけ。古い鍵の登録が残るので、履歴から取り出した鍵でログインできるまま
    { id: 'append-only', apply: [], replay: [NEW_KEY, APPEND], expected: 'insufficient' },
    // 足りない修正：リポジトリの履歴を作り直して、鍵の入ったコミットを捨てる。すでに取り出された鍵は、登録されたまま使える
    {
      id: 'rewrite-history-only',
      apply: [],
      replay: [
        inRepo('checkout -q --orphan clean', "commit -q -m '履歴を作り直す'"),
        inRepo('branch -q -D main', 'branch -q -m main'),
        inRepo('reflog expire --expire=now --all', 'gc -q --prune=now'),
      ],
      expected: 'insufficient',
    },
    // 止めすぎ：登録を空にする。履歴の鍵は使えなくなるが、だれもデプロイできなくなる
    { id: 'remove-every-key', apply: [], replay: [asAdmin(`sudo sh -c ': > ${KEYS}'`)], expected: 'breaks-normal' },
  ],
};
