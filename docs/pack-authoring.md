# 課題パック作成ガイド（契約 v1）

課題パック（MissionPack）を作る人向けの契約資料。型の定義は [`platform/contract/`](../platform/contract/) にあり、本書はその使い方と約束事を説明する。仕様の背景は [spec.md](spec.md) の §5・§11 を参照。

> 初版。オンボーディング教材と3つの課題を作る過程で追補する。

## 1. パックが持つもの

パックは `missions/<パックID>/` に置き、次の 2 つを `MissionPack` として公開する。

| 要素 | 内容 |
| - | - |
| `manifest` | 課題の説明・初期データの扱い・注入レシピ・対策候補・操作定義・攻撃の成立条件・テスト・ヒント・解説（`MissionManifest`）。すべてデータで書く |
| `implementations` | 注入する脆弱な実装と、対策候補の実装。事前にバンドルする関数だけを登録する（`ImplementationRegistry`） |

プラットフォームは任意のソースコード文字列を実行しない。パックが動かせるのは、教材アプリが公開する**フック**（交換点）の実装を、登録済みの関数へ切り替えることだけである。

## 2. フックと実装

教材アプリはフックを `AppDescriptor.hooks` で公開する。

| 項目 | 意味 |
| - | - |
| `id` | フックの ID（例: `memo.read.authorize`） |
| `realm` | `server`：Worker 内の教材ロジックで実行される。`view`：隔離 iframe 内の表示で実行される |
| `contract` | 入出力契約の版。パックは `hooks` に同じ版を書いたフックだけを交換できる |
| `baseline` | 安全な基準状態 S の実装 ID |

実装 ID はパック ID を接頭辞にする（例: `idor/no-owner-check`）。`ImplementationRegistry` の各エントリーは対象のフック ID（`hook`）と関数（`run`）を持つ。関数の引数と戻り値はフックごとに教材アプリが定める。

## 3. 状態 S・V・F とレシピ・対策

- **S（基準）**：すべてのフックが基準実装。正常系・セキュリティのテストがすべて通る。
- **V（脆弱）**：`mutationRecipes[].apply` の実装を注入した状態。`verify.probes` の攻撃が成立し、`tests.target` 以外のテストは通る。
- **F（対策後）**：V に `defenses[].apply` を重ねた状態。

レシピは `appliesTo` でアプリの版とフック契約を宣言する。一致しなければ開始できない。元に戻すときは、`apply` したフックを基準実装へ戻す（`revert: 'baseline'`）。

対策候補には `expected` を書く。

| `expected` | 意味 |
| - | - |
| `secure` | 攻撃を防ぎ、正常系と回帰テストも通る。1 つ以上必要 |
| `insufficient` | 攻撃が成立したまま（例：画面のリンクだけを隠す） |
| `breaks-normal` | 攻撃は防ぐが正常系が壊れる（例：すべての取得を拒否） |

`expected` はパック出荷前の自動検証だけに使う。演習の合否は、選んだ対策の ID ではなく実際の実行結果で決まる。

## 4. 初期データとバリエーション

`fixtures.generator` は教材アプリが提供する初期データ生成器の名前である。生成器は演習ごとの seed から利用者・メモなどを作り、テストが参照する値を `refs` として返す（例: `memos.alice.private.id`）。

`fixtures.variants` は演習の開始条件で、`recipe` が脆弱性の種類を決める。データの違いは seed で決まる。データだけが違う再挑戦を、新しい脆弱性として表示しない。

## 5. テストと攻撃の成立条件

テスト（`TestCase`）と攻撃の成立条件（`ProbeDef`）は、実行可能なコードではなく手順（`Step`）のデータで書く。

```ts
{
  kind: 'request',
  as: 'bob',                                    // fixture の利用者キー。未ログインは 'anonymous'
  request: { method: 'GET', path: '/api/memos/{{memos.alice.private.id}}' },
  expect: { status: [403, 404], body: [{ path: '', is: { notContains: '{{memos.alice.private.body}}' } }] },
}
```

- `{{キー}}` は fixture の `refs`、`{{capture.名前}}` は前の手順の `capture` で取り出した値に置き換わる。特定の ID をハードコードせず、必ず `refs` を使う（複数の seed で同じテストが通ること）。
- `Matcher` の `path` は `.` 区切りで、`''` は値全体、`*` は配列の全要素を指す。
- `events` で観測イベント（SQL のクエリ形、DOM の実行マーカーなど）を検査できる。
- `kind: 'render'` は画面を描画し、表示側の観測イベントを検査する。
- 攻撃阻止のテストは、問い合わせに出てくる利用者・データだけでなく、別の利用者の組み合わせや演習中に作ったデータでも書く。特定の利用者名やメモ ID だけを守る修正を見逃さないため（例：`missions/idor/tests.ts`）。

テストの分類は次のとおり。

| 表示上の分類 | 条件 |
| - | - |
| 攻撃阻止 | `tests.target` に含まれるテスト。V では失敗し、正しい対策後に通る |
| 正常系 | `category: 'normal'` |
| 回帰 | `category: 'security'` のうち `tests.target` に含まれないもの |

アプリ共通のテストも `tests.target` に指定できる。パック固有のテストは `tests.cases` に書く。

`ProbeDef.steps` は事前検証で自動実行し、すべての期待を満たせば攻撃が成立したとみなす。`ProbeDef.detect` はプレイヤー自身の操作（観測した 1 回のやり取り）が攻撃にあたるかの判定に使う。自動 probe では再現の達成印を付けない。`detect` の条件は fixture の値とは比べられるが、やり取りの主体と応答の中身（所有者など）どうしは比べられない。どの利用者のデータでも再現とみなしたいときは、利用者ごとに probe を分ける（例：IDOR の `read-alice-memo`・`read-bob-memo`・`read-carol-memo`）。

## 6. 操作・ヒント・理解確認・振り返り

- `actions`：操作パネルの定型操作。`request` の `{{field.名前}}` は入力欄の値に置き換わる。`editable: true` ならリクエストを直接編集できる。
- `hints`：level 1（着眼点）・2（調査方法）・3（修正方針）を 1 件ずつ。利用しても減点しない。
- `solution`：解法。閲覧したことは本人の記録に残る。
- `transferCheck`：演習と異なる利用者・データ・入力の状況で、原因と有効な対策を選ばせる。自由記述は採点しない。
- `debrief`：原因・対策の理由・持ち帰ってほしい要点。
- `guide`：`kind: 'tutorial'` のパックで必須の操作ガイド。`anchor`（画面上の位置）と `until`（完了とみなす出来事）のデータだけで表示が切り替わる。
  - 表示するのは、`until` の出来事がまだ起きておらず、飛ばしてもいない最初のステップ。プレイヤーはステップを飛ばせる。
  - `body` は次にすることを 1〜2 文で書く。1 ステップに 1 つの操作だけを求める。
  - `praise`（任意）はステップを終えたときにかける短い言葉。`retry`（任意）は `when` の出来事が起きたとき（例：`verify-failed`）に示す次の手。
  - `anchor` の場所は画面上で赤の破線で囲む。閉じたタブの中にあるときは、そのタブを囲む。「場所を表示」を押すと、タブを開いて移動する。
  - ガイドは課題一覧へ戻っても残るため、最後のステップに一覧の操作（`progress-export`）を置ける。

| `anchor` | 画面上の位置 |
| - | - |
| `mission-list` | 課題一覧 |
| `preflight` | 開始前チェック |
| `story` | 状況（問い合わせ・目標） |
| `user-switcher` | 表示する利用者の切り替え |
| `app-preview` | 教材アプリの画面 |
| `actions` | 調査：定型の操作 |
| `request-editor` | 調査：リクエストの編集 |
| `investigation-log` | 調査：観測ログ |
| `hints` | ヒント |
| `defense-panel` | 対策の選択と適用 |
| `verify` | 検証の実行 |
| `results` | 検証結果 |
| `debrief` | 振り返り・理解確認 |
| `reset` | 初期状態へ戻す |
| `progress-export` | 課題一覧：進捗の書き出し・読み込み |

| `until` | 完了とみなす出来事 |
| - | - |
| `started` | 開始前チェックを終えて演習を始めた |
| `user-switched` | 表示する利用者を切り替えた |
| `request-sent` | 調査パネルからリクエストを送った |
| `reproduced` | 再現の達成印を得た |
| `hint-opened` | ヒントを開いた |
| `defense-applied` | 対策を適用した |
| `verify-failed` / `verify-passed` | 検証して不合格／合格だった |
| `understood` | 理解の達成印を得た |
| `reset` | 初期状態へ戻した |
| `exported` | 進捗を書き出した |

## 7. パックを追加する手順

1. `missions/<パックID>/` に `manifest` と `implementations` を作る。ディレクトリ名とパック ID を一致させる。
   - 実装 ID は `<パックID>/…` で始める。実装の登録簿はカタログ全体で 1 つなので、他のパックやアプリの実装と重なると起動時にエラーになる。
   - パック固有のテスト ID は、アプリ共通のテストと重ならないようにする（`<パックID>.…` を推奨）。
   - パックが読み込めるのは `platform/contract` と教材アプリ（`apps/`）、自分のディレクトリの中だけ。他のパックの実装やデータは使わない。
2. `catalog/` にパックを登録する。コアUIに課題 ID の条件分岐を書かない。プラットフォーム（`platform/`・`runtimes/`）はパックを `@catalog` 経由でだけ扱い、教材アプリはパックに依存しない。これらは `pnpm run check:boundaries`（ビルドと CI でも実行）で確かめる。
3. `validatePack(pack, { app, appTestIds, sharedImplementations })` がエラーなしで通ることを確かめる。
4. パック出荷前検証（`pnpm run verify:packs`）で、次の 3 点を確かめる。対策は `expected` どおりの結果になることも確かめる。
   - 基準状態 S で全テストが通る。
   - 脆弱な状態 V では `tests.target` のテストだけが失敗し、`verify.probes` の攻撃が成立する。
   - `expected: 'secure'` の対策を適用すると全テストが通る。

想定外の回帰があるレシピは登録しない。

## 8. データ追加だけでは足りない場合（spec §11.3）

同じ RuntimeAdapter と既存のフックで実行できる課題は、パックとカタログ登録だけで追加できる。次の場合は、教材アプリまたはアダプターの拡張が必要になる。

- 新しい交換点が必要：教材アプリにフックを追加し、基準実装とテストを用意する。
- フックの入出力を変える：フックの `contract` を上げる。古い版を前提にしたパックは開始できなくなる。
- 新しい実行機能が必要（別の言語・OS など）：`Capability` と新しい RuntimeAdapter を追加する。

MVP は開発者が同梱する信頼済みパックだけを扱い、利用者による任意パックの実行は提供しない。

### 課題の追加に必要だった変更の記録（spec §16）

課題を追加するたびに、パックとカタログ登録のほかに必要だった変更をここに記録する。

| 課題 | プラットフォーム（`platform/`・`runtimes/`） | 教材アプリ | 理由 |
| - | - | - | - |
| `idor` | なし | 交換点 `memo.detail.neighbors`（詳細画面の「前のメモ」「次のメモ」の移動先、画面側）を追加し、版を 1.3.0 に上げた | 対策候補「画面のリンクだけを隠す」（spec §8.1）に実際の処理を用意するには、他人のメモへのリンクを出す・出さないを切り替える交換点が必要だった。ID 指定の取得（`memo.read.authorize`）は既存の交換点で足りた |
| `sqli` | なし | なし | 検索クエリの組み立ては既存の交換点 `memo.search.query` で足りた。注入、UNION という語だけの禁止、検索の停止はパックの実装で表せた。この演習が実行するのは SQLite |
