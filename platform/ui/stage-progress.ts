// ステージの表示を差分更新し、新しく到達した項目だけを演出・通知する。
import type { AttemptRecord } from '../contract';
import { sealStates } from './components';
import { fill, h, renderGuard } from './dom';
import { stageStates } from './stages';

const STATE_LABELS = { done: '済', current: 'いま', todo: 'これから' };

export class StageProgress {
  private readonly heading = h('h2', { class: 'stage-count' });
  private readonly list = h('ol', { class: 'stages', 'aria-label': 'ステージ' });
  readonly element = h('section', { class: 'stage-progress' }, this.heading, this.list);
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
    this.heading.textContent = `ステージ ${states.filter((stage) => stage.state === 'done').length} / ${states.length}`;
    fill(this.list, ...states.map((stage, index) => {
      const pending = stage.current ? 'current' : 'todo';
      const visualState = stage.state === 'done' ? 'done' : pending;
      return h('li', {
        'data-state': visualState,
        'aria-current': stage.current ? 'step' : undefined,
        class: arrived.includes(index) ? 'stage-arrived' : undefined,
      }, h('span', { class: 'stage-number' }, index + 1), h('span', {}, stage.label), h('span', { class: 'stage-status' }, STATE_LABELS[visualState]));
    }));
    if (arrived.length) {
      this.announce(states.flatMap((stage, index) => arrived.includes(index) ? [`ステージ ${index + 1}「${stage.label}」に到達しました`] : []).join('。'));
    }
    this.previous = states;
  }
}
