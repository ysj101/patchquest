// ステージの表示を差分更新し（見た目は色、読み上げは文字で状態を示す）、新しく到達した項目だけを演出・通知する。
import type { AttemptRecord } from '../contract';
import { fill, h, renderGuard } from './dom';
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

  update(attempt: AttemptRecord, defenseCurrent: boolean): void {
    const key = [...Object.values(attempt.milestones), ...Object.values(sealStates(attempt, defenseCurrent)), defenseCurrent]
      .map((value) => String(value)).join('|');
    if (!this.guard.changed(key)) return;
    const states = stageStates(attempt, defenseCurrent);
    const arrived = states.flatMap((stage, index) => stage.state === 'done' && this.previous?.[index]?.state === 'todo' ? [index] : []);
    fill(this.list, ...states.map((stage, index) => {
      const pending = stage.current ? 'current' : 'todo';
      const visualState = stage.state === 'done' ? 'done' : pending;
      return h('li', {
        'data-state': visualState,
        title: STATE_LABELS[visualState],
        'aria-current': stage.current ? 'step' : undefined,
        class: arrived.includes(index) ? 'stage-arrived' : undefined,
      }, h('span', { class: 'stage-number' }, index + 1), h('span', {}, stage.label), h('span', { class: 'stage-status visually-hidden' }, STATE_LABELS[visualState]));
    }));
    if (arrived.length) {
      this.announce(states.flatMap((stage, index) => arrived.includes(index) ? [`ステージ ${index + 1}「${stage.label}」に到達しました`] : []).join('。'));
    }
    this.previous = states;
  }
}
