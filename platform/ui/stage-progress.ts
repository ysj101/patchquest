// ステージの表示を差分更新し（見た目は色、読み上げは文字で状態を示す）、新しく到達した項目だけを演出・通知する。
import type { AttemptRecord } from '../contract';
import { fill, h, renderGuard } from './dom';
import { popover } from './info-popover';
import { sealStates, stageStates } from '../progress/stages';

const STATE_LABELS = { done: '済', current: 'いま', todo: 'これから' };

export class StageProgress {
  private readonly list = h('ol', { class: 'stages', 'aria-label': 'ステージ' });
  readonly element = h('section', { class: 'stage-progress' }, this.list);
  private guard = renderGuard();
  private previous: ReturnType<typeof stageStates> | null = null;

  constructor(private readonly announce: (message: string) => void) {}

  /** 再開時も初回描画として扱い、保存済みの到達を演出しない。 */
  reset(): void {
    this.guard = renderGuard();
    this.previous = null;
  }

  /** now は、いまのステージでやること。いまのステージの印に畳み、マウスを乗せるか押すと読める */
  update(attempt: AttemptRecord, defenseCurrent: boolean, now: string): void {
    const key = [...Object.values(attempt.milestones), ...Object.values(sealStates(attempt, defenseCurrent)), defenseCurrent, now]
      .map((value) => String(value)).join('|');
    if (!this.guard.changed(key)) return;
    const states = stageStates(attempt, defenseCurrent);
    const arrived = states.flatMap((stage, index) => stage.state === 'done' && this.previous?.[index]?.state === 'todo' ? [index] : []);
    fill(this.list, ...states.map((stage, index) => {
      const pending = stage.current ? 'current' : 'todo';
      const visualState = stage.state === 'done' ? 'done' : pending;
      const content = [h('span', { class: 'stage-number' }, index + 1), h('span', {}, stage.label), h('span', { class: 'stage-status visually-hidden' }, STATE_LABELS[visualState])];
      return h('li', {
        'data-state': visualState,
        // いまのステージは、状態の代わりにやることを重ねて出す
        title: stage.current ? undefined : STATE_LABELS[visualState],
        'aria-current': stage.current ? 'step' : undefined,
        class: arrived.includes(index) ? 'stage-arrived' : undefined,
      }, ...(stage.current ? [popover(h('button', { type: 'button', class: 'stage-now' }, ...content), [h('p', {}, `今やること：${now}`)])] : content));
    }));
    if (arrived.length) {
      this.announce(states.flatMap((stage, index) => arrived.includes(index) ? [`ステージ ${index + 1}「${stage.label}」に到達しました`] : []).join('。'));
    }
    this.previous = states;
  }
}
