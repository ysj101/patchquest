// 開始前チェック（spec §10）。互換性・注入・事前検証の結果を示す。事前検証はプレイヤーの達成に数えない
import { isInExercise } from '../contract';
import type { ExerciseSnapshot, PreflightStep } from '../orchestrator/orchestrator';
import { status, type StatusKind } from './components';
import { fill, h } from './dom';
import { BLOCKED_LABEL, STEP_LABEL } from './labels';

const STEPS: PreflightStep[] = ['compatibility', 'baseline', 'inject', 'prepare'];
const ENTRY_STATUS = { running: ['running', '確認中'], passed: ['passed', '合格'], failed: ['failed', '不合格'] } as const;

export interface PreflightActions {
  begin(): void;
  retry(): void;
  back(): void;
}

export class PreflightView {
  readonly element = h('section', { class: 'preflight', 'aria-labelledby': 'preflight-title', 'data-anchor': 'preflight', hidden: true });
  private readonly title = h('h1', { id: 'preflight-title', tabIndex: -1 }, '開始前チェック');
  private readonly mission = h('p', { class: 'lead' });
  private readonly list = h('ol', { class: 'checklist' });
  private readonly outcome = h('div', { class: 'preflight-outcome' });

  constructor(private readonly actions: PreflightActions) {
    fill(
      this.element,
      h('p', { class: 'eyebrow' }, '演習を始める前に、環境を点検しています'),
      this.title,
      this.mission,
      h(
        'p',
        { class: 'note' },
        '安全な状態で全テストが通ること、脆弱性を注入すると攻撃が成立することを、演習とは別の環境で自動的に確かめます。この確認はあなたの達成には数えません。',
      ),
      this.list,
      this.outcome,
    );
  }

  focus(): void {
    this.title.focus();
  }

  update(snapshot: ExerciseSnapshot): void {
    const { attempt, pack, preflight, blocked } = snapshot;
    this.mission.textContent = `課題：${pack.manifest.title}`;
    fill(
      this.list,
      ...STEPS.map((step) => {
        const entry = preflight.find((p) => p.step === step);
        const [kind, text]: readonly [StatusKind, string] = entry ? ENTRY_STATUS[entry.status] : ['idle', '待機中'];
        return h('li', { class: 'check', 'data-status': kind }, h('span', { class: 'check-name' }, STEP_LABEL[step]), status(kind, text), entry?.detail ? h('p', { class: 'check-detail' }, entry.detail) : null);
      }),
    );

    // 続きから始めると、前回の対策を適用し直した状態（Prepared より先）で準備が終わる
    if (isInExercise(attempt.state)) {
      const resumed = pack.manifest.defenses.find((d) => d.id === attempt.appliedDefense);
      fill(
        this.outcome,
        h(
          'p',
          { class: 'banner banner-ok', role: 'status' },
          resumed
            ? `準備ができました。データは演習開始時の状態に戻し、前回の対策「${resumed.label}」を適用し直しました。`
            : '準備ができました。脆弱性を注入した状態から、まっさらなデータで演習を始めます。',
        ),
        h('div', { class: 'actions' }, h('button', { type: 'button', class: 'button button-primary', 'data-autofocus': true, on: { click: this.actions.begin } }, '演習を始める')),
      );
    } else if (attempt.state === 'Blocked' && blocked) {
      fill(
        this.outcome,
        h(
          'div',
          { class: 'banner banner-error', role: 'alert' },
          h('p', { class: 'banner-title' }, `${BLOCKED_LABEL[blocked.kind]}（あなたの不合格には数えません）`),
          h('p', { class: 'pre-line' }, blocked.message),
        ),
        h(
          'div',
          { class: 'actions' },
          h('button', { type: 'button', class: 'button button-primary', on: { click: this.actions.retry } }, 'もう一度チェックする'),
          h('button', { type: 'button', class: 'button', on: { click: this.actions.back } }, '課題一覧へ戻る'),
        ),
      );
    } else {
      fill(this.outcome, h('p', { class: 'muted' }, status('running', '点検しています…')));
    }
    (this.outcome.querySelector('[data-autofocus]') as HTMLElement | null)?.focus();
  }
}
