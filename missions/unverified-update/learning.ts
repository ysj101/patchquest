// 確かめない更新のパックの調べ方・操作のしかた・ヒント・解法・理解確認・振り返り。ハッシュを自分で計算して見くらべ、
// 中身を変えると値が変わることを手で確かめてから、同じ確認を取り込みのプログラムに行わせる
import type { ApproachDef, DebriefDef, HintDef, TransferQuestion, WorkedExample } from '../../platform/contract';

/** 仕組みだけを示す例。直し方には触れない（どう直すかは学習者が考える） */
export const WORKED_EXAMPLE: WorkedExample = {
  title: '受け取った更新に 1 行足されていると、その行も root の権限で動く',
  steps: [
    '入力：運用担当が、配布元から受け取った更新を置き場に置き、sudo を付けて取り込みのプログラムを動かす。',
    '処理：取り込みのプログラムは root の権限で動き、置き場の更新を上から順に実行する。',
    '結果：更新の中身は、どの行も root の権限で動く。だれかが途中で足した行も、同じように動く。',
  ],
  takeaway: '取り込みのプログラムは、渡された更新を root の権限でそのまま動かす。だれが書いた行かは区別しない。',
};

/** ハッシュを知らない人が、自分の手で計算して見くらべるところまでの調べ方。直し方には触れない */
export const APPROACH: ApproachDef = {
  cards: [
    {
      title: '運用メモを読む',
      commands: ['cat runbook.txt'],
      observe: '端末は運用担当（operator）として開いています。更新の置き場、取り込みに使うコマンド、ハッシュの一覧の場所を探します。',
    },
    {
      title: '更新のハッシュを計算する',
      commands: ['cd /var/cache/updates', 'sha256sum update.sh'],
      observe: 'ハッシュは、ファイルの中身から計算した 64 文字の値です。中身が同じなら、だれがいつ計算しても同じ値になります。',
    },
    {
      title: '配布元の値と見くらべる',
      commands: ['cat /etc/updates/SHA256SUMS', 'sha256sum -c /etc/updates/SHA256SUMS'],
      observe: '上は、配布元が知らせたハッシュを表示します。下は、コマンドが代わりに見くらべて、同じなら `update.sh: OK` と出します。',
    },
    {
      title: '取り込みのプログラムを読む',
      commands: ['cat /usr/local/bin/apply-update'],
      observe: '取り込みは root（管理者）の権限で、上の行から順に動きます。`sh ./update.sh` が、更新を動かす行です。その前に、中身を確かめているかを見ます。',
      note: '`cd /var/cache/updates || exit 1` は、「置き場へ移る。移れなければ、ここでやめる」という意味です。',
    },
    {
      title: '更新に 1 行足して、値を見る',
      commands: ['echo 足す行 >> update.sh', 'sha256sum update.sh', 'sha256sum -c /etc/updates/SHA256SUMS'],
      observe: '値と結果が、足す前とどう変わるかを見ます。足す行には、運用メモにある「管理者だけが行う保守の操作」のパスを使います。',
      note: '`>>` は、「左のコマンドの出力を、右のファイルの末尾に書き足す」という意味です。',
    },
    {
      title: '書き換えた更新を取り込む',
      observe: '運用メモにあるコマンドで取り込みます。足した行がどの権限で動いたかは、観測ログの「プログラムの実行」に出ます。',
    },
  ],
};

/** root のファイルを編集する道具（sudoedit）の使い方。保存や行の足し方は編集画面が案内する。どのファイルのどの行をどう直すかには触れない */
export const REPAIR_GUIDE: ApproachDef = {
  cards: [
    {
      title: '直すファイルを決める',
      commands: ['ls -l ファイルのパス'],
      observe: '調査で読んだファイルのうち、どれを直せば、更新を動かす前に中身を確かめるようになるかを考えます。',
      note: '`ls -l` は、ファイルの持ち主を表示します。root（管理者）が持ち主のファイルは、root しか書き換えられません。',
    },
    {
      title: 'sudoedit で開く',
      commands: ['sudoedit ファイルのパス'],
      observe: 'ファイルが、端末の中の編集画面に開きます。端末を使う利用者は、画面の「表示する利用者」で切り替えられます。',
      note: '`sudoedit` は、ファイルの写しを自分の権限で編集し、保存したときだけ、root の権限で元のファイルへ書き戻します。',
    },
    {
      title: '置き場だけを変えても、直したことにならない',
      observe: '置き場（`/var/cache/updates`）の中だけを変えるコマンドは、「あなたが加えた変更」に並びません。配布元で書き換えられた更新は、そのまま届くからです。',
    },
    {
      title: '2 つの更新で試す',
      commands: ["sed -i '$d' /var/cache/updates/update.sh", 'sha256sum -c /etc/updates/SHA256SUMS'],
      observe: '運用担当の端末で、書き換えた更新と、配布元が出したままの更新の両方を取り込みます。`update.sh: OK` に戻れば、中身は配布元が出したままです。',
      note: "`sed -i '$d'` は、ファイルの末尾の 1 行を消します。更新に足した行を戻すのに使います。",
    },
  ],
};

export const HINTS: HintDef[] = [
  {
    level: 1,
    text: '取り込みのプログラムは、更新を動かす行（`sh ./update.sh`）の前に、中身を確かめていますか。確かめていなければ、更新に何が書いてあっても root の権限で動きます。',
  },
  {
    level: 2,
    text: '運用担当（operator）の端末で、置き場の更新 `/var/cache/updates/update.sh` に、保守の操作のパスを 1 行足します。`sudo apply-update` で取り込み、観測ログで権限を確かめます。',
  },
  {
    level: 3,
    text: '利用者を admin に替え、`sudoedit /usr/local/bin/apply-update` で 6 行目を `sha256sum -c /etc/updates/SHA256SUMS || exit 1` に書き換えます。',
  },
];

export const SOLUTION =
  '6 行目で、更新を動かす前に、ハッシュを一覧と照らします。`|| exit 1` がないと、合わなくても次の行へ進みます。置き場を書き換えられなくするだけでは、配布元で書き換えられた更新を防げません。';

export const TRANSFER_CHECK: TransferQuestion[] = [
  {
    id: 'install-script-cause',
    situation:
      '別の会社の手順書には、「配布元からインストール用のスクリプトをダウンロードし、sudo sh install.sh で動かす」とだけ書いてあります。配布元のページには、スクリプトのハッシュ（SHA-256）が載っていますが、手順書はそれに触れていません。',
    prompt: 'この手順のいちばんの問題はどれでしょうか。',
    choices: [
      {
        id: 'runs-unchecked',
        label: '途中で書き換えられたスクリプトでも、気づかないまま root の権限で動かしてしまう',
        correct: true,
        explanation: 'ハッシュを計算して、配布元の値と見くらべていません。中身が変わっていても、気づく機会がありません。',
      },
      {
        id: 'downloads',
        label: 'スクリプトをダウンロードして使っている',
        correct: false,
        explanation: 'ダウンロードして使うこと自体は問題ではありません。確かめずに動かすことが問題です。',
      },
      {
        id: 'too-long',
        label: 'ハッシュが 64 文字もあり、人の目では見くらべられない',
        correct: false,
        explanation: '見くらべるのは、sha256sum -c が代わりに行います。長さは問題になりません。',
      },
    ],
  },
  {
    id: 'same-place-defense',
    situation:
      'ある配布元のサイトが乗っ取られ、配っているファイルが書き換えられました。同じサイトに置いてあったハッシュの一覧（SHA256SUMS）も、書き換えたファイルに合うように書き換えられていました。',
    prompt: '受け取る側の対策として、有効なのはどれでしょうか。',
    choices: [
      {
        id: 'separate-channel',
        label: 'ハッシュの一覧を、ファイルとは別の、書き換えられにくい経路で受け取る（配布元の署名が付いた一覧を使うなど）',
        correct: true,
        explanation: '見くらべる相手まで書き換えられると、ハッシュは合ってしまいます。相手は、攻撃する人の手が届かないところから受け取ります。',
      },
      {
        id: 'check-twice',
        label: 'sha256sum -c を 2 回実行して、2 回とも OK になることを確かめる',
        correct: false,
        explanation: '書き換えられた一覧と何回見くらべても、結果は OK のままです。',
      },
      {
        id: 'download-again',
        label: 'ファイルをダウンロードし直す',
        correct: false,
        explanation: '同じサイトからは、書き換えられた同じファイルが届きます。',
      },
      {
        id: 'file-size',
        label: 'ファイルの大きさが、前の版と大きく変わっていないかを確かめる',
        correct: false,
        explanation: '大きさをほとんど変えずに、中身を書き換えることができます。',
      },
    ],
  },
];

export const DEBRIEF: DebriefDef = {
  cause:
    '取り込みのプログラムには、もともと、更新のハッシュを一覧と見くらべる行がありました。しかし、その行が「一時的に」外されたまま、戻されていませんでした。取り込みは root の権限で動くので、更新に足された行も root の権限で動きました。',
  defenseRationale:
    'ハッシュは、ファイルの中身から計算した値です。中身が 1 文字でも変わると、まったく別の値になります。配布元が知らせた値と、受け取ったものから自分で計算した値が同じなら、中身は配布元が出したままだと分かります。sha256sum -c は、この見くらべを行うコマンドです。見くらべる相手（一覧）は、受け取るものとは別の、書き換えられにくい場所に置きます。置き場を守るだけでは足りません。配布元で書き換えられた更新は、そのまま届くからです。',
  takeaways: [
    'ダウンロードしたプログラムや更新は、動かす前に、sha256sum -c でハッシュを確かめる。Ubuntu などの配布元は、ファイルと並べて、SHA256SUMS という名前のハッシュの一覧を公開している',
    'ダウンロードしたものを動かすスクリプトを見たら、動かす行の前に、ハッシュを確かめる行と、「合わなければやめる」があるかを読む',
    'ハッシュの一覧は、受け取るものとは別の、書き換えられにくい経路で受け取る。配布元は、一覧に署名を付けて、一覧そのものが書き換えられていないかも確かめられるようにしている',
    'apt や apk などのパッケージ管理は、パッケージを入れるときに、この確認を自動で行う。確認を飛ばすオプション（apt の --allow-unauthenticated、apk の --allow-untrusted）を付けたままにしない',
    '「一時的に」外した確認は、戻し忘れるとそのままセキュリティホールになる',
    'この課題の apply-update と /etc/updates/ は、教材用に用意したもの。sha256sum・sha256sum -c と、SHA256SUMS の名前と書き方は、実際の Linux と同じ',
  ],
};
