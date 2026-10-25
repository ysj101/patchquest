// 操作ガイド（練習用パック）。マニフェストの guide を 1 ステップずつ示し、各ステップの until の出来事が起きたら、
// 短い言葉（praise）をかけて次へ進む。うまくいかなかったとき（retry.when）は次の手を示す。
// 画面上の位置は data-anchor で探し、案内先だけを光らせる。吹き出しは画面上部に留まる一行の帯に置き、暗幕では覆わない。
// コアUIに課題ごとの分岐は入れず、ガイドの中身はすべてパックのデータで決まる
import type { AttemptRecord, GuideMilestone, GuideStep } from '../contract';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { REVEALABLE_ATTR, REVEAL_EVENT, SHOWN_EVENT } from './components';
import { characterFace, GUIDE } from './characters';
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

type GuidePlace = { readonly current: number; readonly total: number };

/**
 * 記録から復元できる until が最初に現れるステップを作業台の 1 とする。それより前は列の先頭から数える。
 * total はステップ列の長さにする。作業台の最初が「1 / 6」になるためで、作業台のステップだけを数えた長さにはしない。
 */
function guidePlace(steps: readonly GuideStep[], step: GuideStep): GuidePlace {
  const index = steps.indexOf(step);
  if (index < 0) throw new Error('表示中のステップが一覧にありません');
  let origin = 0;
  for (const candidate of steps) {
    if (candidate.until in FROM_RECORD) break;
    origin += 1;
  }
  const current = index < origin ? index + 1 : index - origin + 1;
  return { current, total: steps.length };
}

/** 記録に残らず、画面の操作でだけ分かる出来事。学習UIが reach で知らせる */
export type ReportedMilestone = Exclude<GuideMilestone, keyof typeof FROM_RECORD>;

type StepState = 'done' | 'current' | 'skipped' | 'todo';
const STEP_STATE_TEXT: Record<StepState, string> = { done: '済み', current: 'いまのステップ', skipped: '飛ばした', todo: 'これから' };

/** 今の画面にある案内先。表示を求めれば見える入れ物（タブのパネルなど）に隠れているものも含む */
function findTarget(anchor: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(`[data-anchor="${anchor}"]`)].find((el) => !el.closest(`[hidden]:not([${REVEALABLE_ATTR}])`));
}

export interface GuideActions {
  announce(message: string): void;
  /** 練習を終えて課題一覧へ戻る */
  finish(): void;
}

export class GuidePanel {
  readonly element = h('aside', { class: 'guide', 'aria-label': '操作ガイド', hidden: true });
  /** ガイドしている演習。別の演習が始まったら、そのパックのガイドで始め直す */
  private attemptId: string | null = null;
  private steps: GuideStep[] = [];
  private readonly reached = new Set<GuideMilestone>();
  private readonly skipped = new Set<string>();
  /** 直前に終えたステップにかける言葉 */
  private praise: string | null = null;
  private marked: Element | null = null;

  constructor(private readonly actions: GuideActions) {
    // タブを開くと案内先が見えるようになるので、印を付け直す
    document.addEventListener(SHOWN_EVENT, () => this.refresh());
  }

  /** 演習の記録を反映する。別の演習が始まったら始め直し、ガイドのないパックなら閉じる */
  sync({ attempt, pack }: ExerciseSnapshot): void {
    if (attempt.attemptId !== this.attemptId) {
      this.attemptId = attempt.attemptId;
      this.steps = pack.manifest.guide ?? [];
      this.reached.clear();
      this.skipped.clear();
      this.praise = null;
      this.element.hidden = this.steps.length === 0;
      this.render();
    }
    if (this.element.hidden) return;
    this.advance(() => {
      for (const [milestone, happened] of Object.entries(FROM_RECORD)) if (happened(attempt)) this.reached.add(milestone as GuideMilestone);
    });
  }

  /** 画面の操作で起きた出来事を知らせる。同時に起きた出来事はまとめて渡すと、読み上げが 1 回になる */
  reach(...milestones: ReportedMilestone[]): void {
    if (!this.element.hidden) this.advance(() => milestones.forEach((milestone) => this.reached.add(milestone)));
  }

  /** 案内先に印を付け直す。案内先が閉じたタブの中なら、そのタブを開く操作に印を付ける。画面が切り替わったときにも呼ぶ */
  refresh(): void {
    this.marked?.removeAttribute(TARGET_ATTR);
    const step = this.element.hidden ? undefined : this.current();
    const target = step && findTarget(step.anchor);
    const closed = target?.closest(`[hidden][${REVEALABLE_ATTR}]`);
    this.marked = (closed ? document.getElementById(closed.getAttribute(REVEALABLE_ATTR) ?? '') : target) ?? null;
    this.marked?.setAttribute(TARGET_ATTR, '');
  }

  private current(): GuideStep | undefined {
    return this.steps.find((s) => !this.reached.has(s.until) && !this.skipped.has(s.id));
  }

  /** うまくいかなかったときの言葉。その出来事がもう起きていれば返す */
  private retryText(step: GuideStep | undefined): string | null {
    return step?.retry && this.reached.has(step.retry.when) ? step.retry.text : null;
  }

  /** 出来事や飛ばしたステップを反映する。ステップが進めば言葉をかけ、うまくいかなければ次の手を読み上げる */
  private advance(change: () => void): void {
    const before = this.current();
    const retryBefore = this.retryText(before);
    const size = this.reached.size + this.skipped.size;
    change();
    if (this.reached.size + this.skipped.size === size) return;
    const after = this.current();
    if (after !== before) {
      this.praise = before && this.reached.has(before.until) ? (before.praise ?? null) : null;
      this.actions.announce([this.praise, after ? `次は「${after.title}」` : '練習の手順はすべて終わりました'].filter(Boolean).join('。'));
    } else {
      const retry = this.retryText(after);
      if (retry && retry !== retryBefore) this.actions.announce(retry);
    }
    this.render();
  }

  private close(): void {
    this.element.hidden = true;
    this.refresh();
  }

  private finish(): void {
    this.close();
    this.actions.finish();
  }

  /** 案内先を表示する。隠れていれば入れ物に表示を求め、見える位置へ移してフォーカスする */
  private reveal(step: GuideStep): void {
    const target = findTarget(step.anchor);
    if (!target) {
      this.actions.announce('案内している場所は、今の画面にはありません');
      return;
    }
    target.dispatchEvent(new Event(REVEAL_EVENT, { bubbles: true }));
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
  }

  private render(): void {
    const step = this.current();
    const place = step ? guidePlace(this.steps, step) : null;
    const trackItem = (s: GuideStep) => {
      const state: StepState = s === step ? 'current' : this.reached.has(s.until) ? 'done' : this.skipped.has(s.id) ? 'skipped' : 'todo';
      return h(
        'li',
        { 'data-state': state, 'aria-current': state === 'current' ? 'step' : null, title: s.title },
        h('span', { class: 'visually-hidden' }, `${s.title}：${STEP_STATE_TEXT[state]}`),
      );
    };
    const retry = this.retryText(step);
    fill(
      this.element,
      h(
        'div',
        { class: 'guide-bar' },
        h('h2', {}, `${GUIDE.name}の操作ガイド`),
        h('ol', { class: 'guide-track', 'aria-label': '練習の手順' }, ...this.steps.map(trackItem)),
        h('p', { class: 'guide-count' }, place ? `${place.current} / ${place.total}` : '完了'),
      ),
      h(
        'div',
        { class: 'guide-coach', 'data-done': step ? null : 'true' },
        characterFace(GUIDE.name, true),
        h(
          'div',
          { class: 'guide-bubble' },
          // うまくいかなかったときは、前のステップへの言葉より次の手を見せる
          step && this.praise && !retry ? h('p', { class: 'guide-praise' }, h('span', { 'aria-hidden': true }, '✓ '), this.praise) : null,
          h('h3', {}, step ? step.title : (this.praise ?? '練習はおしまいです')),
          h('p', {}, step ? step.body : 'これで基本の流れはひと通りです。本番の課題では、利用者の切り替えやリクエストの編集、ヒントも使えます。'),
          retry ? h('p', { class: 'guide-retry' }, retry) : null,
        ),
        h(
          'div',
          { class: 'guide-actions' },
          ...(step
            ? [
                h('button', { type: 'button', class: 'button button-primary button-chunky', on: { click: () => this.reveal(step) } }, '場所を表示'),
                h('button', { type: 'button', class: 'button button-quiet', on: { click: () => this.advance(() => this.skipped.add(step.id)) } }, 'このステップを飛ばす'),
              ]
            : [h('button', { type: 'button', class: 'button button-primary button-chunky', on: { click: () => this.finish() } }, '課題一覧へ')]),
        ),
      ),
      h('button', { type: 'button', class: 'guide-close', 'aria-label': 'ガイドを閉じる', title: 'ガイドを閉じる', on: { click: () => this.close() } }, '✕'),
    );
    this.refresh();
  }
}
