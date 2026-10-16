// 演習の評価結果を記号・文言・色で示し、常設の live 領域への読み上げと任意の効果音を添える。
import type { StoryDef } from '../contract';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { characterVoice, guideVoice, requesterVoice } from './characters';
import { status, type StatusKind } from './components';
import { fill, h, renderGuard } from './dom';
import type { EffectSettingsStore } from './effect-settings';
import type { ResultEffect, ResultEffectKind } from './result-effect-model';
import { VERDICT_TITLE } from './labels';
import { ResultSound } from './result-sound';

const TITLES: Record<ResultEffectKind, string> = {
  reproduced: '脆弱性を再現しました', ...VERDICT_TITLE,
};

const STATUS: Record<ResultEffectKind, StatusKind> = { reproduced: 'alert', secured: 'passed', insufficient: 'failed' };

export class ResultEffects {
  /** 隠した領域を見せながら中身を入れても読み上げは保証されないので、role は付けず announce に任せる */
  readonly element = h('section', { class: 'result-callout', hidden: true });
  private requester: StoryDef['requester'];
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
   * やり取りの観測はこれらを変えないので、再現のコールアウトは残る。
   * キーが変わらない操作（続きから始める、同じ対策の再適用、脆弱な状態での初期化）は操作側で clear() を呼ぶ */
  update(snapshot: ExerciseSnapshot): void {
    this.requester = snapshot.pack.manifest.story.requester;
    const { attempt, defenseCurrent, platformError } = snapshot;
    const key = [attempt.attemptId, attempt.configHash, attempt.state, defenseCurrent, attempt.lastVerification?.runId ?? '', platformError ?? ''].join('|');
    if (this.guard.changed(key)) this.clear();
  }

  show(effect: ResultEffect): void {
    const { kind, detail } = effect;
    const title = TITLES[kind];
    const voice = kind === 'insufficient' ? null : requesterVoice(this.requester, kind);
    this.element.dataset.result = kind;
    this.element.hidden = false;
    fill(this.element,
      h('h2', {}, status(STATUS[kind], title)),
      h('p', {}, detail),
      kind === 'insufficient' ? null : guideVoice(kind, true),
      voice ? characterVoice(voice) : null,
      h('button', { type: 'button', class: 'button button-quiet', on: { click: () => this.clear() } }, '結果を閉じる'),
    );
    const reaction = voice ? `。${voice.name}。${voice.text}` : '';
    this.announce(`${title}。${detail}${reaction}`);
    void this.sound.play(kind);
  }
}
