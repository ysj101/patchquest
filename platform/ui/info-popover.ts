// ⓘ ボタンや文字のボタンで開く小さな説明。クリック・Enter・Space で開閉、Esc で閉じ、マウスを乗せても同じ中身を出す。
// マウスオーバーだけに頼らず、キーボードでも同じ操作ができる（spec §10, A22）
import { h } from './dom';

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

function popover(button: HTMLElement, content: Content): HTMLElement {
  const id = `info-${++sequence}`;
  const panel = h('div', { id, class: 'info-panel', role: 'note', hidden: true }, ...content);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', id);
  // 押す・キーで開いたもの（pinned）はマウスが離れても残る。マウスを乗せただけなら離れたら閉じる。
  // 押して閉じた直後は、マウスがまだ乗っていても開き直さない（離れたら元に戻る）
  let pinned = false;
  let hovering = false;
  let hoverSuppressed = false;
  const render = () => {
    const open = pinned || (hovering && !hoverSuppressed);
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  };
  const close = () => {
    pinned = false;
    hoverSuppressed = true;
    render();
  };
  button.addEventListener('click', () => {
    if (pinned) close();
    else {
      pinned = true;
      render();
    }
  });
  const root = h('span', { class: 'info' }, button, panel);
  root.addEventListener('mouseenter', () => {
    hovering = true;
    render();
  });
  root.addEventListener('mouseleave', () => {
    hovering = false;
    hoverSuppressed = false;
    render();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden) return;
    event.preventDefault();
    close();
    button.focus();
  });
  return root;
}
