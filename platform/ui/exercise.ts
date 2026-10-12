// 演習画面（spec §10）。演習票の見出し（課題・状態・達成印）、注入した架空サービスであることの表示、
// 動く教材アプリと、調査・対策・振り返りの道具を並べる
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { sealStates, seals } from './components';
import { fill, h } from './dom';
import { STATE_LABEL } from './labels';

export interface ExerciseActions {
  back(): void;
}

export class ExerciseView {
  readonly element = h('section', { class: 'exercise', 'aria-labelledby': 'exercise-title', hidden: true });
  /** 教材アプリのプレビュー（隔離 iframe）を置く場所。iframe を作り直さないよう、この要素は使い回す */
  readonly previewSlot = h('div', { class: 'preview-slot', 'data-anchor': 'app-preview' });
  /** 調査・対策・振り返りの道具を置く場所 */
  readonly tools = h('div', { class: 'tools' });
  /** 利用者の切り替えなど、プレビューの上に置く操作 */
  readonly previewBar = h('div', { class: 'preview-bar' });
  private readonly title = h('h1', { id: 'exercise-title', tabIndex: -1 });
  private readonly ticket = h('p', { class: 'ticket-id' });
  private readonly state = h('p', { class: 'state-stamp' });
  private readonly sealSlot = h('div', { class: 'ticket-seals' });

  constructor(actions: ExerciseActions) {
    fill(
      this.element,
      h(
        'header',
        { class: 'ticket' },
        h('div', { class: 'ticket-main' }, this.ticket, this.title, this.state),
        this.sealSlot,
        h('div', { class: 'ticket-actions' }, h('button', { type: 'button', class: 'button button-quiet', on: { click: actions.back } }, '課題一覧へ戻る')),
      ),
      h(
        'p',
        { class: 'banner banner-notice', role: 'note' },
        h('strong', {}, '学習用に脆弱性を注入した架空のサービスです。'),
        ' 実在のサービスの診断結果ではありません。データはすべて架空で、このブラウザの中だけで動いています。',
      ),
      h('div', { class: 'workbench' }, h('div', { class: 'app-pane' }, this.previewBar, this.previewSlot), this.tools),
    );
  }

  focus(): void {
    this.title.focus();
  }

  update(snapshot: ExerciseSnapshot): void {
    const { attempt, pack, defenseCurrent } = snapshot;
    this.title.textContent = pack.manifest.title;
    this.ticket.textContent = `演習票 ${attempt.attemptId.slice(0, 8)}・seed ${attempt.seed}`;
    this.state.textContent = STATE_LABEL[attempt.state];
    this.state.dataset.state = attempt.state;
    fill(this.sealSlot, seals(sealStates(attempt, defenseCurrent)));
  }
}
