// CSP のパックの仕組みの例・調べ方・操作のしかた・ヒント・解法・理解確認・振り返り
import type { ApproachDef, DebriefDef, HintDef, TransferQuestion, WorkedExample } from '../../platform/contract';

export const WORKED_EXAMPLE: WorkedExample = {
  title: 'ブラウザは、だれが書いたスクリプトかを区別しない',
  steps: [
    '掲示板のページの HTML には、コメントが入ります。だれかがコメントに <script>…</script> と書きこむと、それも HTML の一部になります。',
    'ブラウザは、届いた HTML を上から読み、スクリプトを見つけたら動かします。掲示板が用意したものか、コメントに紛れたものかは区別しません。',
    'サーバは、ページと一緒に「応答ヘッダ」という注意書きを送れます。その 1 つの Content-Security-Policy（CSP）は、動かしてよいスクリプトの場所をブラウザに伝えるものです。',
  ],
  takeaway: 'CSP が付いていないページでは、ブラウザは HTML にあるスクリプトをすべて動かします。',
};

export const APPROACH: ApproachDef = {
  cards: [
    {
      title: '掲示板を開いて、起きることを見る',
      observe: '教材アプリの掲示板を見ます。ページの上に赤い知らせが出たら、コメントに書きこまれたスクリプトが動いています。',
    },
    {
      title: '観測ログで、ページの中身を見る',
      observe: '観測ログで `GET /board` の記録を開きます。「応答の本文（HTML）」から、`<script>` と書きこまれたコメントを探します。',
    },
    {
      title: '掲示板自身のスクリプトを探す',
      observe: '本文の上のほうに `<script src=…>` があります。掲示板が用意したファイルで、コメントの件数を出しています。',
      note: '`src` が付くものはファイルを読みこむ書き方です。付かないものは、ページの中に直接書いたスクリプトです。',
    },
    {
      title: '応答ヘッダを見る',
      observe: '同じ記録の「応答ヘッダ」を見ます。`Content-Security-Policy` という行があるかを確かめます。',
      note: '応答ヘッダは、サーバがページと一緒に送る注意書きです。Chrome の開発者ツールの「ネットワーク」でも見られます。',
    },
  ],
};

export const REPAIR_GUIDE: ApproachDef = {
  cards: [
    {
      title: '設定のページを開く',
      observe: '応答ヘッダを変えられるのは管理者（admin）です。表示する利用者を切り替えると、掲示板の上に設定へのリンクが出ます。',
    },
    {
      title: '値を入れて保存する',
      observe: '`Content-Security-Policy` の欄に値を入れて「保存する」を押します。値は `指定の名前 許す場所` の形で書きます。',
      note: '例：`img-src \'self\'` は「画像は、ページと同じ場所のものだけ」という意味です。',
    },
    {
      title: '掲示板に戻って確かめる',
      observe: '「掲示板へ戻る」を押します。赤い知らせが出るか、コメントの件数が出るかを見ます。観測ログの「ブラウザが止めたもの」も見ます。',
    },
    {
      title: 'テストする',
      observe: '「攻撃とふだんの使い方をテストする」を押します。合格しなければ、設定のページで値を変えて保存し直します。',
    },
  ],
};

export const HINTS: HintDef[] = [
  {
    level: 1,
    text: '掲示板のページの HTML には、スクリプトが 2 種類あります。ファイルを読みこむもの（掲示板が用意したもの）と、ページの中に直接書かれたもの（コメントに紛れたもの）です。ブラウザに、この 2 つを区別させる方法を考えます。',
  },
  {
    level: 2,
    text: "Content-Security-Policy の script-src は、動かしてよいスクリプトの場所を決める指定です。場所を決めると、ブラウザは、ページの中に直接書かれたスクリプトを動かさなくなります。'unsafe-inline' と書いたときだけ、動かします。",
  },
  {
    level: 3,
    text: "表示する利用者を admin に切り替え、応答ヘッダの設定を開きます。Content-Security-Policy の欄に script-src 'self' と入れて保存します。'self' は「ページと同じ場所のファイル」という意味です。'unsafe-inline' は足しません。",
  },
];

export const SOLUTION =
  "表示する利用者を admin に切り替え、掲示板の「管理：応答ヘッダの設定」を開きます。Content-Security-Policy の欄に script-src 'self' と入れて保存します。掲示板へ戻ると、コメントのスクリプトは動かず、観測ログに「ブラウザが止めたもの」が出ます。コメントの件数は、今までどおり出ます。script-src 'self' 'unsafe-inline' では、ページの中に書かれたスクリプトも許すので、止まりません。script-src 'none' では、掲示板自身のスクリプトも止まり、件数が出なくなります。";

export const TRANSFER_CHECK: TransferQuestion[] = [
  {
    id: 'cause',
    situation:
      "レシピを共有するサイトで、レシピの説明に書きこまれた <script> が、ほかの人の画面で動きました。このサイトのページの応答には、Content-Security-Policy: script-src 'self' 'unsafe-inline' が付いていました。",
    prompt: 'ヘッダが付いているのに、スクリプトが動いたのはなぜですか。',
    choices: [
      {
        id: 'unsafe-inline',
        label: "'unsafe-inline' が、ページの中に直接書かれたスクリプトを許しているから",
        correct: true,
        explanation: "'unsafe-inline' を足すと、ページの中に直接書かれたスクリプトも動きます。書きこまれたスクリプトも、ページの中に直接書かれたものです。",
      },
      {
        id: 'self',
        label: "'self' が、どこのスクリプトでも許す指定だから",
        correct: false,
        explanation: "'self' が許すのは、ページと同じ場所から読みこむファイルだけです。ページの中に直接書かれたスクリプトは許しません。",
      },
      {
        id: 'images-only',
        label: 'Content-Security-Policy は、画像にしか効かないから',
        correct: false,
        explanation: 'script-src はスクリプトに効く指定です。画像には img-src という別の指定を使います。',
      },
    ],
  },
  {
    id: 'defense',
    situation: '写真のアルバムのサイトに Content-Security-Policy を足します。このサイトのページは、自分のサーバに置いた /js/app.js を読みこんで、写真を並べています。',
    prompt: '書きこまれたスクリプトを止めて、写真の表示は壊さない値はどれですか。',
    choices: [
      {
        id: 'self',
        label: "script-src 'self'",
        correct: true,
        explanation: '同じ場所から読みこむ /js/app.js は動き、ページの中に直接書かれたスクリプトは動きません。',
      },
      {
        id: 'none',
        label: "script-src 'none'",
        correct: false,
        explanation: 'すべてのスクリプトが止まります。/js/app.js も動かず、写真が並ばなくなります。',
      },
      {
        id: 'self-inline',
        label: "script-src 'self' 'unsafe-inline'",
        correct: false,
        explanation: "'unsafe-inline' がページの中に直接書かれたスクリプトを許すので、書きこまれたスクリプトも動きます。",
      },
    ],
  },
];

export const DEBRIEF: DebriefDef = {
  cause:
    '掲示板のページの応答に、Content-Security-Policy が付いていませんでした。ブラウザは、HTML にあるスクリプトを、コメントに紛れたものも含めて、すべて動かしました。',
  defenseRationale:
    "script-src 'self' を付けると、ブラウザは、ページと同じ場所のファイルから読みこんだスクリプトだけを動かします。コメントに紛れたスクリプトは、ページの中に直接書かれているので動きません。掲示板自身のスクリプトは、ファイルから読みこんでいるので動き続けます。",
  takeaways: [
    'Content-Security-Policy は二段目の守りです。コメントを文字として表示する直し（一段目）も、あわせて行います。',
    '自分のサイトでは、Chrome の開発者ツールの「ネットワーク」でページを選び、応答ヘッダに Content-Security-Policy があるかを見ます。',
    "'unsafe-inline' があると守りになりません。ページの中に直接書いたスクリプトは、ファイルに移して読みこみます。",
    'この課題の「応答ヘッダの設定」のページは教材用です。実際には、Web サーバの設定（nginx の add_header など）や、アプリが応答にヘッダを付けるコードで決めます。',
    '教材アプリのページには、教材がページを囲うために足した sandbox という Content-Security-Policy も付いています。開発者ツールでは 2 つ見えます。',
    '赤い知らせを出した pqMarker は、教材用の目印です。実際の攻撃では、ここで画面の中身を盗むなどのスクリプトが動きます。',
  ],
};
