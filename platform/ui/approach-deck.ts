// 調べ方・操作のしかたのカード。いま行うことを 1 枚だけ出し、「次へ」「戻る」で送る。
// 「全体の流れ」を押すと、カードの見出しだけの一覧に替わり、どのカードへも移れる
import { splitInlineCode, type ApproachCard, type ApproachDef } from '../contract';
import { h } from './dom';

/** `…` で囲んだ部分を等幅のコードにした、文の部品。パックは読み込み時に検証済みなので、書き誤りは例外にする */
function withCode(text: string): (HTMLElement | string)[] {
  const parts = splitInlineCode(text);
  if (!parts) throw new Error(`コードの囲みが閉じていません：${text}`);
  return parts.map((part) => (part.code ? h('code', { class: 'inline-code' }, part.text) : part.text));
}

/** コピーの結果を出しておく時間。過ぎたら、ボタンを元の表示に戻す */
const COPY_RESULT_MS = 2000;
const COPY_RESULT_TEXT = { copied: 'コピーしました', failed: 'コピーできませんでした' };

/** 打つコマンド 1 行と、それをクリップボードへ入れるボタン。結果は、ボタンの印と読み上げで伝える */
function commandItem(command: string): HTMLElement {
  const status = h('span', { class: 'visually-hidden', role: 'status' });
  let timer: number | undefined;
  const button = h('button', { type: 'button', class: 'copy-command', title: 'コピー', 'aria-label': `コピー：${command}`, on: { click: () => void copy() } }, h('span', { class: 'copy-icon', 'aria-hidden': true }));

  function showResult(result: keyof typeof COPY_RESULT_TEXT): void {
    button.dataset.result = result;
    button.title = status.textContent = COPY_RESULT_TEXT[result];
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      delete button.dataset.result;
      button.title = 'コピー';
      status.textContent = '';
    }, COPY_RESULT_MS);
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // ブラウザがクリップボードへの書き込みを許さなかった。黙って終えず、できなかったことを見せる
      showResult('failed');
      return;
    }
    showResult('copied');
  }

  return h('li', {}, h('code', { class: 'inline-code' }, command), button, status);
}

/** カード 1 枚。見出し・打つコマンド・見るところ・記号の意味の順に並べる */
function cardItem(card: ApproachCard): HTMLElement {
  return h(
    'li',
    { class: 'approach-card', hidden: true },
    h('h4', {}, card.title),
    card.commands ? h('ul', { class: 'approach-commands' }, ...card.commands.map(commandItem)) : null,
    h('p', {}, ...withCode(card.observe)),
    card.note ? h('p', { class: 'approach-note' }, ...withCode(card.note)) : null,
  );
}

/**
 * 調べ方・操作のしかたの中身（見出し・何枚目か・カード・送るボタン）。最初は 1 枚目を出す。
 * 「次へ」は案内を送るだけで、カードの操作を行ったかどうかは確かめない
 */
export function approachDeck(titleId: string, title: string, approach: ApproachDef): HTMLElement[] {
  const total = approach.cards.length;
  let index = 0;
  let overview = false;

  const count = h('span', { class: 'approach-count' });
  const cards = approach.cards.map(cardItem);
  const flowButtons = approach.cards.map((card, to) => h('button', { type: 'button', class: 'button button-quiet', on: { click: () => show(to, false) } }, card.title));
  const flow = h('ol', { class: 'approach-flow', 'aria-label': `${title}の全体の流れ`, hidden: true }, ...flowButtons.map((button) => h('li', {}, button)));
  const toggle = h('button', { type: 'button', class: 'button button-quiet', on: { click: () => show(index, !overview) } });
  const back = h('button', { type: 'button', class: 'button', on: { click: () => show(index - 1, false) } }, '戻る');
  const next = h('button', { type: 'button', class: 'button button-primary', on: { click: () => show(index + 1, false) } }, '次へ');
  const actions = h('div', { class: 'actions approach-actions' }, back, next);

  /** to 枚目を出す。inOverview なら、カードの代わりに見出しの一覧を出す */
  function show(to: number, inOverview: boolean): void {
    const focused = document.activeElement;
    index = to;
    overview = inOverview;
    cards.forEach((card, at) => (card.hidden = overview || at !== index));
    flowButtons.forEach((button, at) => (at === index ? button.setAttribute('aria-current', 'step') : button.removeAttribute('aria-current')));
    flow.hidden = !overview;
    actions.hidden = overview;
    count.textContent = `${index + 1} / ${total}`;
    toggle.textContent = overview ? '手順に戻る' : '全体の流れ';
    toggle.setAttribute('aria-expanded', String(overview));
    back.disabled = index === 0;
    next.disabled = index === total - 1;
    // 押したボタンが使えなくなった・一覧ごと隠れたときは、フォーカスを失わないよう、使えるボタンへ移す
    if (focused === next && next.disabled) back.focus();
    else if (focused === back && back.disabled) next.focus();
    else if (focused instanceof HTMLElement && flow.contains(focused) && !overview) toggle.focus();
  }

  show(0, false);
  return [
    h('div', { class: 'approach-head' }, h('h3', { id: titleId }, title), count, toggle),
    // カードが替わったことを、読み上げにも伝える
    h('ol', { class: 'approach-cards', 'aria-live': 'polite' }, ...cards),
    flow,
    actions,
  ];
}
