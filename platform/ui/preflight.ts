// 開始前チェック（spec §10）。互換性・注入・事前検証の結果を示す。事前検証はプレイヤーの達成に数えない。
// 合格したら学習UIがそのまま演習画面へ進めるので、この画面に残るのは点検中と開始できないときだけ
import type { ExerciseSnapshot, PreflightStep } from '../orchestrator/orchestrator';
import { status, type StatusKind } from './components';
import { fill, h } from './dom';
import { BLOCKED_LABEL, STEP_LABEL } from './labels';

/** 本物の Linux を動かす課題で、点検の間に出す案内 */
const MACHINE_WAIT_NOTE = 'この課題は、ブラウザの中で本物の Linux を動かします。準備に 10〜30 秒ほどかかります。';

const STEPS: PreflightStep[] = ['compatibility', 'baseline', 'inject', 'prepare'];
const ENTRY_STATUS = { running: ['running', '確認中'], passed: ['passed', '合格'], failed: ['failed', '不合格'] } as const;

export interface PreflightActions {
  retry(): void;
  back(): void;
}

export class PreflightView {
  readonly element = h('section', { class: 'preflight', 'aria-labelledby': 'preflight-title', 'data-anchor': 'preflight', hidden: true });
  private readonly title = h('h1', { id: 'preflight-title', tabIndex: -1 }, '開始前チェック');
  private readonly mission = h('p', { class: 'lead' });
  private readonly list = h('ol', { class: 'checklist' });
  private readonly outcome = h('div', { class: 'preflight-outcome' });
  private readonly summary = h('summary', {});
  /** 点検の内容。ふだんは畳んでおき、開始できないときは開く */
  private readonly details = h(
    'details',
    { class: 'preflight-details' },
    this.summary,
    h(
      'p',
      { class: 'note' },
      '安全な状態でテストが通ること、弱点を入れると攻撃が通ることを、自動で確かめます。あなたの成績には数えません。',
    ),
    this.list,
  );

  constructor(private readonly actions: PreflightActions) {
    fill(this.element, h('p', { class: 'eyebrow' }, '始める前に、準備ができているか確かめています'), this.title, this.mission, this.outcome, this.details);
  }

  focus(): void {
    this.title.focus();
  }

  update(snapshot: ExerciseSnapshot): void {
    const { attempt, pack, preflight, blocked } = snapshot;
    this.mission.textContent = `課題：${pack.manifest.title}`;
    const passed = preflight.filter((check) => check.status === 'passed').length;
    this.summary.textContent = `確かめたこと（${passed} / ${STEPS.length} 項目が合格）`;
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
          h('button', { type: 'button', class: 'button button-primary', on: { click: this.actions.retry } }, 'もう一度チェックする'),
          h('button', { type: 'button', class: 'button', on: { click: this.actions.back } }, '課題一覧へ戻る'),
        ),
      );
    } else {
      // 合格した直後も、演習画面へ切り替わるまでは点検中として見せる
      fill(
        this.outcome,
        h('p', { class: 'muted' }, status('running', `確かめています…（${passed} / ${STEPS.length}）`)),
        // 本物の Linux を起動する課題は、ほかの課題より長く待つ。止まっているように見えないよう、先に伝える
        pack.manifest.runtime.capabilities.includes('linux-vm') ? h('p', { class: 'note' }, MACHINE_WAIT_NOTE) : null,
      );
    }
  }
}
