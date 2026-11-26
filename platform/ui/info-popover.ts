// ⓘ ボタンや文字のボタンで開く小さな説明。クリック・Enter・Space で開閉、Esc で閉じ、マウスを乗せても同じ中身を出す。
// マウスオーバーだけに頼らず、キーボードでも同じ操作ができる（spec §10, A22）
import { h } from './dom';
import { isPopoverOpen, nextPopoverState, type PopoverEvent, type PopoverState } from './popover-model';

let sequence = 0;

type Content = (Node | string | null)[];

/**
 * 説明を畳んだ ⓘ ボタンと、その説明の入れ物を返す。label はボタンの読み上げ名（例：「IDOR の説明」）。
 * フォーカスが移っただけでは閉じず、Esc か再度の押下で閉じる。マウスを乗せて開いただけなら、マウスが離れたときにも閉じる
 */
export function infoPopover(label: string, ...content: Content): HTMLElement {
  return popover(h('button', { type: 'button', class: 'info-button', 'aria-label': label }, h('span', { 'aria-hidden': true }, 'i')), content);
}

/** 文字のボタンに畳んだ説明と、その入れ物を返す。開閉の操作は ⓘ と同じ */
export function labelPopover(label: string, ...content: Content): HTMLElement {
  return popover(h('button', { type: 'button', class: 'button button-quiet info-label' }, label), content);
}

/**
 * 見出しと、その区画の補足を畳んだ ⓘ を横に並べる。補足は、読まなくても操作できる内容にだけ使う
 * （次の一歩を決めるのに要る文は、畳まずに本文へ置く）
 */
export function headingWithInfo(heading: HTMLElement, ...content: Content): HTMLElement {
  return h('div', { class: 'heading-info' }, heading, infoPopover(`${heading.textContent} の説明`, ...content));
}

/** 呼び出し側が用意したボタン（いまのステージの印など）に説明を畳む。開閉の操作は ⓘ と同じ */
export function popover(button: HTMLElement, content: Content): HTMLElement {
  const id = `info-${++sequence}`;
  const panel = h('div', { id, class: 'info-panel', role: 'note', hidden: true }, ...content);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', id);
  // 押す・キーで開いたものはマウスが離れても残る。マウスを乗せただけなら離れたら閉じる。
  // 閉じた直後は、マウスがまだ乗っていても開き直さない（離れたら元に戻る）。遷移は POPOVER_MACHINE に従う
  let state: PopoverState = 'closed';
  const apply = (event: PopoverEvent) => {
    state = nextPopoverState(state, event);
    panel.hidden = !isPopoverOpen(state);
    button.setAttribute('aria-expanded', String(isPopoverOpen(state)));
  };
  button.addEventListener('click', () => apply('press'));
  const root = h('span', { class: 'info' }, button, panel);
  root.addEventListener('mouseenter', () => apply('enter'));
  root.addEventListener('mouseleave', () => apply('leave'));
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isPopoverOpen(state)) return;
    event.preventDefault();
    apply('escape');
    button.focus();
  });
  return root;
}
