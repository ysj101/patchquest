// 開始前チェック（spec §10）。課題名を見出しに、準備の進み具合と、互換性・注入・事前検証の結果を示す。事前検証はプレイヤーの達成に数えない。
// 合格したら学習UIがそのまま演習画面へ進めるので、この画面に残るのは点検中と開始できないときだけ
import { usesMachine } from '../contract';
import type { ExerciseSnapshot, PreflightStep } from '../orchestrator/orchestrator';
import { status, type StatusKind } from './components';
import { fill, h } from './dom';
import { BLOCKED_LABEL, STEP_LABEL } from './labels';

/** 本物の Linux を動かす課題で、点検の間に出す案内 */
const MACHINE_WAIT_NOTE = '30 秒程度かかります。';

const STEPS: PreflightStep[] = ['compatibility', 'baseline', 'inject', 'prepare'];
const ENTRY_STATUS = { running: ['running', '確認中'], passed: ['passed', '合格'], failed: ['failed', '不合格'] } as const;

export interface PreflightActions {
  retry(): void;
  back(): void;
}

export class PreflightView {
  readonly element = h('section', { class: 'preflight', 'aria-labelledby': 'preflight-title', 'data-anchor': 'preflight', hidden: true });
  /** 見出しは課題名。何が始まるのかを先に見せる */
  private readonly title = h('h1', { id: 'preflight-title', tabIndex: -1 });
  private readonly list = h('ol', { class: 'checklist' });
  private readonly outcome = h('div', { class: 'preflight-outcome' });
  /** 点検の内容。ふだんは畳んでおき、開始できないときは開く */
  private readonly details = h(
    'details',
    { class: 'preflight-details' },
    h('summary', {}, '準備の内容'),
    h('p', { class: 'note' }, '自動で行います。あなたの成績には数えません。'),
    this.list,
  );

  constructor(private readonly actions: PreflightActions) {
    fill(this.element, this.title, this.outcome, this.details);
  }

  focus(): void {
    this.title.focus();
  }

  update(snapshot: ExerciseSnapshot): void {
    const { attempt, pack, preflight, blocked } = snapshot;
    this.title.textContent = pack.manifest.title;
    const passed = preflight.filter((check) => check.status === 'passed').length;
    // 開閉はプレイヤーに任せる。開始できないときだけ開いて理由を見せる
    if (attempt.state === 'Blocked') this.details.open = true;
    fill(
      this.list,
      ...STEPS.map((step) => {
        const entry = preflight.find((p) => p.step === step);
        const [kind, text]: readonly [StatusKind, string] = entry ? ENTRY_STATUS[entry.status] : ['idle', '待機中'];
        return h('li', { class: 'check', 'data-status': kind }, h('span', { class: 'check-name' }, STEP_LABEL[step]), status(kind, text), entry?.detail ? h('p', { class: 'check-detail' }, entry.detail) : null);
      }),
    );

    if (attempt.state === 'Blocked' && blocked) {
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
          h('button', { type: 'button', class: 'button button-primary', on: { click: this.actions.retry } }, 'もう一度試す'),
          h('button', { type: 'button', class: 'button', on: { click: this.actions.back } }, '課題一覧へ戻る'),
        ),
      );
    } else {
      // 合格した直後も、演習画面へ切り替わるまでは点検中として見せる
      fill(
        this.outcome,
        h('p', { class: 'muted' }, status('running', `準備しています…（${passed} / ${STEPS.length}）`)),
        // 本物の Linux を起動する課題は、ほかの課題より長く待つ。止まっているように見えないよう、先に伝える
        usesMachine(pack.manifest.runtime.capabilities) ? h('p', { class: 'note' }, MACHINE_WAIT_NOTE) : null,
      );
    }
  }
}
