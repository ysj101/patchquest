// ミッション開始時の事件の提示（改善案 §4.1）。開始前チェックの後、演習画面の中で 1 画面だけ見せる。
// 閉じても ExerciseView と教材アプリの iframe は作り直さない。2 回目以降は出さず、状況タブから読み直せる
import type { StoryDef } from '../contract';
import { injectionNotice } from './components';
import { fill, h } from './dom';

/** 事件の提示。SECURITY ALERT、問い合わせ、依頼、MISSION START を 1 画面に置く */
export class StoryIntro {
  readonly element: HTMLDialogElement;
  /** 閉じたときに呼ぶ。静かに閉じるときは null にして、画面遷移の処理を走らせない */
  private onDismiss: (() => void) | null = null;

  constructor() {
    this.element = h('dialog', { class: 'dialog story-intro', 'aria-labelledby': 'story-intro-alert' });
    this.element.addEventListener('close', () => this.closed());
  }

  get isOpen(): boolean {
    return this.element.open;
  }

  /**
   * 事件の提示を開く。MISSION START（Enter）でも Esc でも閉じ、閉じたら onDismiss。
   * ダイアログを閉じると開く前のボタンへフォーカスが戻るため、onDismiss は次のフレームで呼ぶ
   */
  show(story: StoryDef, onDismiss: () => void): void {
    this.onDismiss = onDismiss;
    this.render(story);
    if (!this.element.open) this.element.showModal();
    this.element.querySelector('button')?.focus();
  }

  /** 導入を出さないとき。開いていれば閉じるが、onDismiss は呼ばない */
  closeSilently(): void {
    this.onDismiss = null;
    if (this.element.open) this.element.close();
  }

  private closed(): void {
    const dismiss = this.onDismiss;
    this.onDismiss = null;
    // 閉じたあとも本文が残ると、演習画面の注意書きと重複して見つかってしまう
    this.element.replaceChildren();
    if (!dismiss) return;
    requestAnimationFrame(() => dismiss());
  }

  private render(story: StoryDef): void {
    const close = () => this.element.close();
    fill(
      this.element,
      h('p', { class: 'story-intro-mark', 'aria-hidden': true }, '🚨'),
      h('h2', { id: 'story-intro-alert', class: 'story-intro-alert' }, 'SECURITY ALERT', h('span', { class: 'visually-hidden' }, '。事件の提示')),
      h('p', { class: 'incident' }, story.incident),
      h('p', { class: 'story-intro-request' }, story.goal),
      injectionNotice(),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'button button-primary button-chunky button-big', on: { click: close } }, 'MISSION START'),
      ),
      h('p', { class: 'note' }, 'Enter または Esc キーでもスキップして始められます。'),
    );
  }
}
