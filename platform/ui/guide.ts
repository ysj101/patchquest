// 操作ガイド（練習用パック）。マニフェストの guide を順に示し、各ステップの until の出来事が起きたら次へ進む。
// 画面上の位置は data-anchor で探す。コアUIに課題ごとの分岐は入れず、ガイドの中身はすべてパックのデータで決まる
import type { AttemptRecord, GuideMilestone, GuideStep } from '../contract';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { REVEALABLE_ATTR, REVEAL_EVENT } from './components';
import { fill, h } from './dom';

/** 案内している場所に付ける印（CSS で枠を描く） */
const TARGET_ATTR = 'data-guide-target';

/** 演習の記録から分かる出来事。続きから始めたときにも引き継がれる */
const FROM_RECORD = {
  reproduced: (a) => a.badges.reproduction.achieved,
  'hint-opened': (a) => a.hintsOpened.length > 0,
  'defense-applied': (a) => a.appliedDefense !== null,
  'verify-failed': (a) => a.lastVerification?.passed === false,
  'verify-passed': (a) => a.lastVerification?.passed === true,
  understood: (a) => a.badges.understanding.achieved,
} satisfies Partial<Record<GuideMilestone, (attempt: AttemptRecord) => boolean>>;

/** 記録に残らず、画面の操作でだけ分かる出来事。学習UIが reach で知らせる */
export type ReportedMilestone = Exclude<GuideMilestone, keyof typeof FROM_RECORD>;

type StepState = 'done' | 'current' | 'skipped' | 'todo';
const STEP_STATE_TEXT: Record<StepState, string> = { done: '済み', current: 'いまのステップ', skipped: '飛ばした', todo: 'これから' };

/** 今の画面にある案内先。表示を求めれば見える入れ物（タブのパネルなど）に隠れているものも含む */
function findTarget(anchor: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(`[data-anchor="${anchor}"]`)].find((el) => !el.closest(`[hidden]:not([${REVEALABLE_ATTR}])`));
}

export class GuidePanel {
  readonly element = h('aside', { class: 'guide', 'aria-labelledby': 'guide-title', hidden: true });
  /** ガイドしている演習。別の演習が始まったら、そのパックのガイドで始め直す */
  private attemptId: string | null = null;
  private steps: GuideStep[] = [];
  private readonly reached = new Set<GuideMilestone>();
  private readonly skipped = new Set<string>();
  private marked: Element | null = null;

  constructor(private readonly announce: (message: string) => void) {}

  /** 演習の記録を反映する。別の演習が始まったら始め直し、ガイドのないパックなら閉じる */
  sync({ attempt, pack }: ExerciseSnapshot): void {
    if (attempt.attemptId !== this.attemptId) {
      this.attemptId = attempt.attemptId;
      this.steps = pack.manifest.guide ?? [];
      this.reached.clear();
      this.skipped.clear();
      this.element.hidden = this.steps.length === 0;
      this.render();
    }
    if (this.element.hidden) return;
    this.advance(() => {
      for (const [milestone, happened] of Object.entries(FROM_RECORD)) if (happened(attempt)) this.reached.add(milestone as GuideMilestone);
    });
  }

  /** 画面の操作で起きた出来事を知らせる */
  reach(milestone: ReportedMilestone): void {
    if (!this.element.hidden) this.advance(() => this.reached.add(milestone));
  }

  /** 案内先に印を付け直す。画面が切り替わったときにも呼ぶ */
  refresh(): void {
    this.marked?.removeAttribute(TARGET_ATTR);
    const step = this.element.hidden ? undefined : this.current();
    this.marked = (step && findTarget(step.anchor)) ?? null;
    this.marked?.setAttribute(TARGET_ATTR, '');
  }

  private current(): GuideStep | undefined {
    return this.steps.find((s) => !this.reached.has(s.until) && !this.skipped.has(s.id));
  }

  /** 出来事や飛ばしたステップを反映する。進んだステップは読み上げで知らせる */
  private advance(change: () => void): void {
    const before = this.current();
    const size = this.reached.size + this.skipped.size;
    change();
    if (this.reached.size + this.skipped.size === size) return;
    const after = this.current();
    if (after !== before) this.announce(after ? `操作ガイド：次は「${after.title}」です` : '操作ガイド：練習の手順はすべて終わりました');
    this.render();
  }

  private close(): void {
    this.element.hidden = true;
    this.refresh();
  }

  /** 案内先を表示する。隠れていれば入れ物に表示を求め、見える位置へ移してフォーカスする */
  private reveal(step: GuideStep): void {
    const target = findTarget(step.anchor);
    if (!target) {
      this.announce('案内している場所は、今の画面にはありません');
      return;
    }
    target.dispatchEvent(new Event(REVEAL_EVENT, { bubbles: true }));
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
  }

  private render(): void {
    const step = this.current();
    const trackItem = (s: GuideStep) => {
      const state: StepState = s === step ? 'current' : this.reached.has(s.until) ? 'done' : this.skipped.has(s.id) ? 'skipped' : 'todo';
      return h(
        'li',
        { 'data-state': state, 'aria-current': state === 'current' ? 'step' : null, title: s.title },
        h('span', { class: 'visually-hidden' }, `${s.title}：${STEP_STATE_TEXT[state]}`),
      );
    };
    fill(
      this.element,
      h(
        'div',
        { class: 'guide-head' },
        h('h2', { id: 'guide-title', class: 'eyebrow guide-label' }, '操作ガイド'),
        h('p', { class: 'guide-count' }, step ? `${this.steps.indexOf(step) + 1} / ${this.steps.length}` : '完了'),
        h('ol', { class: 'guide-track', 'aria-label': '練習の手順' }, ...this.steps.map(trackItem)),
        h('button', { type: 'button', class: 'button button-quiet', on: { click: () => this.close() } }, 'ガイドを閉じる'),
      ),
      step
        ? h(
            'div',
            { class: 'guide-body' },
            h('h3', {}, step.title),
            h('p', {}, step.body),
            h(
              'div',
              { class: 'actions' },
              h('button', { type: 'button', class: 'button button-primary', on: { click: () => this.reveal(step) } }, '場所を表示'),
              h('button', { type: 'button', class: 'button button-quiet', on: { click: () => this.advance(() => this.skipped.add(step.id)) } }, 'このステップを飛ばす'),
            ),
          )
        : h(
            'div',
            { class: 'guide-body' },
            h('h3', {}, '練習はおしまいです'),
            h('p', {}, '課題一覧から、本番の課題に進めます。この練習は何度でもやり直せます。'),
          ),
    );
    this.refresh();
  }
}
