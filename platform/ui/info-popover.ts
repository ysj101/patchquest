// ⓘ ボタンで開く小さな説明。クリック・Enter・Space で開閉、Esc で閉じ、マウスを乗せても同じ中身を出す。
// マウスオーバーだけに頼らず、キーボードでも同じ操作ができる（spec §10, A22）
import { h } from './dom';

let sequence = 0;

/**
 * 説明を畳んだ ⓘ ボタンと、その説明の入れ物を返す。label はボタンの読み上げ名（例：「IDOR の説明」）。
 * フォーカスが移っただけでは閉じず、Esc か再度の押下、またはマウスが離れたときに閉じる
 */
export function infoPopover(label: string, ...content: (Node | string | null)[]): HTMLElement {
  const id = `info-${++sequence}`;
  const panel = h('div', { id, class: 'info-panel', role: 'note', hidden: true }, ...content);
  const button = h(
    'button',
    { type: 'button', class: 'info-button', 'aria-label': label, 'aria-expanded': 'false', 'aria-controls': id },
    h('span', { 'aria-hidden': true }, 'i'),
  );
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
