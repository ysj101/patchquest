// 演習の評価結果を、常設の live 領域への読み上げと任意の効果音で知らせる。再現できたときだけ、作業台の上に 1 行の通知を出す。
// テストの結果は対策タブに出るので、ここでは画面に重ねて出さない
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { status } from './components';
import { fill, h, renderGuard } from './dom';
import type { EffectSettingsStore } from './effect-settings';
import type { ResultEffect, ResultEffectKind } from './result-effect-model';
import { VERDICT_TITLE } from './labels';
import { ResultSound } from './result-sound';

const TITLES: Record<ResultEffectKind, string> = {
  reproduced: 'セキュリティホールを再現できました', ...VERDICT_TITLE,
};

export class ResultEffects {
  /** 再現の通知。隠した領域を見せながら中身を入れても読み上げは保証されないので、role は付けず announce に任せる */
  readonly element = h('section', { class: 'result-callout', hidden: true });
  private readonly sound: ResultSound;
  private readonly guard = renderGuard();

  constructor(
    store: EffectSettingsStore,
    /** 常設の live 領域へ読み上げる */
    private readonly announce: (message: string) => void,
  ) {
    this.sound = new ResultSound(store);
  }

  clear(): void {
    this.element.hidden = true;
  }

  /** 新しい演習・検証の開始と結果（判定不可・実行環境のエラーを含む）・対策の状態の変化で消す。
   * やり取りの観測はこれらを変えないので、再現の通知は残る。
   * キーが変わらない操作（続きから始める、同じ対策の再適用、脆弱な状態での初期化）は操作側で clear() を呼ぶ */
  update(snapshot: ExerciseSnapshot): void {
    const { attempt, defenseCurrent, platformError } = snapshot;
    const key = [attempt.attemptId, attempt.configHash, attempt.state, defenseCurrent, attempt.lastVerification?.runId ?? '', platformError ?? ''].join('|');
    if (this.guard.changed(key)) this.clear();
  }

  show({ kind, detail }: ResultEffect): void {
    const title = TITLES[kind];
    if (kind === 'reproduced') {
      this.element.hidden = false;
      fill(this.element, h('h2', {}, status('alert', title)), h('button', { type: 'button', class: 'button button-quiet', on: { click: () => this.clear() } }, '閉じる'));
    }
    this.announce(`${title}。${detail}`);
    void this.sound.play(kind);
  }
}
