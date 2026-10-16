# Phase 1 チェックポイントの記録（Issue #68）

ゲーミフィケーション改善の Phase 1（ストーリー導入・演出設定・結果の演出・ステージ分割）が、[patchquest-gamification-improvements.md](patchquest-gamification-improvements.md) §5 の最小受入条件を満たしたかの記録。確認項目は Issue #68 の 7 つ。自動で確かめられる項目は PR #92 で E2E にし、この記録を書く時点の `origin/main`（`f80e0c1`）で実行して通ったことを確認した。人による観察は**未実施**（§3）。

## 1. 自動で確かめた項目

実行したコマンド（2026-10-16、PC 版 Chrome、`node scripts/build.mjs --test` のあと）：

```sh
pnpm exec vitest run tests/unit/orchestrator.test.ts   # 22 件通過（A14 を含む）
pnpm exec playwright test \
  tests/e2e/keyboard.spec.ts tests/e2e/mission-briefing.spec.ts tests/e2e/stages.spec.ts \
  tests/e2e/progress.spec.ts tests/e2e/stored-xss.spec.ts tests/e2e/sqli.spec.ts \
  missions/idor/__tests__/idor.spec.ts tests/e2e/onboarding.spec.ts \
  tests/e2e/result-effects.spec.ts tests/e2e/effect-settings.spec.ts
# 38 件通過（project chrome 32 件、chrome-quiet 6 件）
```

| # | 確認項目（Issue #68） | 何で確かめたか | 結果 |
| - | - | - | - |
| 1 | 初見ユーザーがミッションの目的を短時間で理解し、すぐ操作を始められる（#65） | 表示と操作は `tests/e2e/mission-briefing.spec.ts`（初回の事件と依頼・注意書き・演習票の表示、Esc で閉じる、再挑戦と続きからは既定で飛ばす、動きを減らしてもすぐ読める）。「短時間で理解できる」かは人の観察（§3）で測る | 自動分は通過。観察は未実施 |
| 2 | 攻撃成功・失敗・防御成功の違いが、画面表示と実際の評価結果で一致する（#66）。A06・A07・A09・A10 | `tests/e2e/fixtures.ts` の `expectCalloutMatchesVerdict`（コールアウトの `data-result`・文言・防御の達成印が検証結果の総評と一致）を、IDOR（`missions/idor/__tests__/idor.spec.ts`：UI だけの修正 A06、認可 A07、全拒否）、保存型 XSS（`tests/e2e/stored-xss.spec.ts`：A09）、SQLi（`tests/e2e/sqli.spec.ts`：A10）の各検証後に呼ぶ。演出が評価結果に連動することは `tests/e2e/result-effects.spec.ts` | 通過 |
| 3 | ミッション内で少なくとも数回、意味のある達成フィードバックを得られる（#67） | `tests/e2e/stages.spec.ts`（五段階の到達と現在地、再開・再読み込み・取り込みでの保持、動きを減らしても文字で示す、メモを開くだけで到達） | 通過 |
| 4 | 演出を無効化しても学習を完了できる（#64）。動き・音をオフにして 3 ミッションを完走 | `playwright.config.ts` の project `chrome-quiet`（`reducedMotion: 'reduce'`）で IDOR・保存型 XSS・SQLi の完走 spec と練習課題を実行。`tests/e2e/onboarding.spec.ts` で OS 設定に応じて `html[data-motion]` が切り替わることを確認。効果音は既定でオフ（`tests/e2e/effect-settings.spec.ts`） | 通過（chrome-quiet 6 件） |
| 5 | 既存の「再現・防御・理解」の評価、外部通信なし、ブラウザ内進捗保存を維持（A14・A15・A17・A19） | A14：`tests/unit/orchestrator.test.ts`「事前検証の自動 probe では再現の達成印が付かず、プレイヤーの操作で付く」。A15：`tests/e2e/progress.spec.ts`（保存・復元・不正 JSON・保存不可）。A17：`tests/e2e/stored-xss.spec.ts`（固定ペイロードが Host DOM・保存領域に触れない）。A19：すべての E2E で `tests/e2e/fixtures.ts` が localhost 以外への通信を遮断し、発生したら失敗にする | 通過 |
| 6 | キーボードだけで導入のスキップ・設定変更・演習完了ができる（A22） | `tests/e2e/keyboard.spec.ts`：Tab／矢印／Enter／Space／Esc だけで、開始 → 導入を Esc で飛ばす → 設定で動きをオフ → 調査で再現 → 対策の適用と検証 → 理解確認 → 達成印 3 つとステージ 5 / 5 | 通過 |
| 7 | 同意のある手元の観察で初見の 2〜3 名に試してもらい、分かりにくかった点を記録する（spec §16） | 自動化できない。手順と記録の形式は [evaluation-metrics.md](evaluation-metrics.md) §3・§4 | **未実施**（§3） |

## 2. 扉の判断と見つかった問題

- Phase 2 の Issue（#69 安全化の可視化、#71 XP、#73 実績、#74 キャラクター）は、自動で確かめられる 6 項目が通った状態で着手し、すでにマージ済み。この扉は事実上通過している。
- Phase 1 の確認で見つかった問題は Issue 化した。いずれも学習の判定ではなく E2E の実行環境の負荷に起因するもので、#80（評価の E2E の 1 秒上限）と #86（トップページ描画の待ち）は修正済み、#97（利用者切り替えと初期表示の競合）は対応中。
- 人による観察が終わっていないため、「短時間で理解できる」「分かりにくい点」は未確認のまま。これは Phase 1 の価値の検証であって Phase 2 の着手条件ではないと判断し、観察は #77 の手順に沿って別途行う。

## 3. 人による観察（未実施）

同意のある手元の観察は、この記録を書いた時点では**行っていない**。実施したら [evaluation-metrics.md](evaluation-metrics.md) §4 の形式で下の欄を埋め、Phase 1 後の基準として残す。

### 3.1 セッションの記録（参加者ごと。未記入）

| 項目 | p01 | p02 | p03 |
| - | - | - | - |
| 実施日・版 | | | |
| 事前の経験 | | | |
| 取り組んだ課題 | | | |
| 目的の理解にかかった時間（導入を閉じてから最初の送信まで） | | | |
| 不十分な対策を選んだ理由 | | | |
| 分かりにくかった点 | | | |
| 再挑戦意向 | | | |
| 翌週の再訪意向 | | | |
| 進捗 JSON | | | |

### 3.2 集計（未記入）

`pnpm run metrics <ディレクトリ>` の出力を [evaluation-metrics.md](evaluation-metrics.md) §4.2 の表に転記する。人数が 2〜3 名のあいだは割合の差を結論にせず、不十分な対策の理由と分かりにくかった点の記述を主な根拠にする。
