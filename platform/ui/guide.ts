// 操作ガイド（練習用パック）。マニフェストの guide を順に示し、各ステップの until の出来事が起きたら次へ進む。
// 画面上の位置は data-anchor で探す。コアUIに課題ごとの分岐は入れず、ガイドの中身はすべてパックのデータで決まる
import type { GuideMilestone, GuideStep } from '../contract';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { fill, h } from './dom';

/** 案内している場所に付ける印（CSS で枠を描く） */
const TARGET_ATTR = 'data-guide-target';

type StepState = 'done' | 'current' | 'skipped' | 'todo';
const STEP_STATE_TEXT: Record<StepState, string> = { done: '済み', current: 'いまのステップ', skipped: '飛ばした', todo: 'これから' };

/** 記録から分かる出来事。続きから始めたときや、操作の結果として記録が変わったときに反映する */
function milestonesOf({ attempt }: ExerciseSnapshot): GuideMilestone[] {
  const reached: GuideMilestone[] = [];
  if (attempt.badges.reproduction.achieved) reached.push('reproduced');
  if (attempt.hintsOpened.length > 0) reached.push('hint-opened');
  if (attempt.appliedDefense !== null) reached.push('defense-applied');
  if (attempt.lastVerification) reached.push(attempt.lastVerification.passed ? 'verify-passed' : 'verify-failed');
  if (attempt.badges.understanding.achieved) reached.push('understood');
  return reached;
}

/** 今の画面で見えている（タブに隠れているだけのものを含む）案内先 */
function findTarget(anchor: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(`[data-anchor="${anchor}"]`)].find((el) => {
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      if (node.hidden && node.getAttribute('role') !== 'tabpanel') return false;
    }
    return true;
  });
}

export class GuidePanel {
  readonly element = h('aside', { class: 'guide', 'aria-labelledby': 'guide-title', hidden: true });
  private packId: string | null = null;
  private steps: GuideStep[] = [];
  private readonly reached = new Set<GuideMilestone>();
  private readonly skipped = new Set<string>();
  private shownStep: string | null | undefined;

  constructor(private readonly announce: (message: string) => void) {}

  /** パックのガイドを最初から始める。ガイドのないパックなら閉じる */
  start(packId: string, steps: GuideStep[] | undefined): void {
    this.packId = steps?.length ? packId : null;
    this.steps = steps ?? [];
    this.reached.clear();
    this.skipped.clear();
    this.shownStep = undefined;
    this.element.hidden = this.packId === null;
    this.render();
  }

  /** 出来事を記録する。現在のステップが終われば次へ進む */
  reach(milestone: GuideMilestone): void {
    if (this.packId === null || this.reached.has(milestone)) return;
    this.reached.add(milestone);
    this.render();
  }

  /** 演習の記録から分かる出来事を反映する（ガイド中のパックの演習だけ） */
  sync(snapshot: ExerciseSnapshot): void {
    if (snapshot.pack.manifest.id !== this.packId) return;
    milestonesOf(snapshot).forEach((m) => this.reach(m));
  }

  /** 画面が切り替わったときに、案内先の印を付け直す */
  refresh(): void {
    document.querySelectorAll(`[${TARGET_ATTR}]`).forEach((el) => el.removeAttribute(TARGET_ATTR));
    const step = this.current();
    if (step && !this.element.hidden) findTarget(step.anchor)?.setAttribute(TARGET_ATTR, '');
  }

  private close(): void {
    this.packId = null;
    this.element.hidden = true;
    this.refresh();
  }

  private current(): GuideStep | undefined {
    return this.steps.find((s) => !this.reached.has(s.until) && !this.skipped.has(s.id));
  }

  /** 案内先を表示する。タブに隠れていればそのタブを開き、見える位置へ移してフォーカスする */
  private reveal(step: GuideStep): void {
    const target = findTarget(step.anchor);
    if (!target) return this.announce('案内している場所は、今の画面にはありません');
    const panel = target.closest<HTMLElement>('[role="tabpanel"]');
    if (panel?.hidden) document.querySelector<HTMLElement>(`[role="tab"][aria-controls="${panel.id}"]`)?.click();
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
  }

  private render(): void {
    const step = this.current();
    const id = step?.id ?? null;
    if (id !== this.shownStep && this.shownStep !== undefined && this.packId !== null) {
      this.announce(step ? `操作ガイド：次は「${step.title}」です` : '操作ガイド：練習の手順はすべて終わりました');
    }
    this.shownStep = id;
    const index = step ? this.steps.indexOf(step) : this.steps.length;
    const stateOf = (s: GuideStep, i: number): StepState => (s === step ? 'current' : this.reached.has(s.until) ? 'done' : i < index ? 'skipped' : 'todo');
    const trackItem = (s: GuideStep, i: number) => {
      const state = stateOf(s, i);
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
        h('h2', { id: 'guide-title', class: 'guide-label' }, '操作ガイド'),
        h('p', { class: 'guide-count' }, step ? `${index + 1} / ${this.steps.length}` : '完了'),
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
              h('button', { type: 'button', class: 'button button-quiet', on: { click: () => (this.skipped.add(step.id), this.render()) } }, 'このステップを飛ばす'),
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
