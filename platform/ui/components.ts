// 学習UIの共通部品。合否や状態は色だけでなく記号と言葉でも示す（spec §10）
import { BADGE_KINDS, type AttemptRecord, type BadgeKind } from '../contract';
import { h } from './dom';
import { BADGE_HINT, BADGE_LABEL } from './labels';

export type StatusKind = 'idle' | 'running' | 'passed' | 'failed' | 'blocked' | 'error';

const STATUS_MARK: Record<StatusKind, string> = {
  idle: '・',
  running: '◌',
  passed: '✓',
  failed: '✕',
  blocked: '⊘',
  error: '⚠',
};

/** 状態の表示。記号・言葉・色の 3 つで伝える */
export function status(kind: StatusKind, text: string): HTMLSpanElement {
  return h('span', { class: `status status-${kind}` }, h('span', { class: 'status-mark', 'aria-hidden': true }, STATUS_MARK[kind]), text);
}

/** 達成印の状態。stale は記録上は達成しているが、現在の構成では未確認 */
export type SealState = 'done' | 'todo' | 'stale';

const SEAL_MARK: Record<SealState, string> = { done: '済', todo: '未', stale: '再' };
const SEAL_TEXT: Record<SealState, string> = { done: '達成', todo: '未達成', stale: '記録あり（再検証で確定）' };

/** 演習票に押す 3 つの検印（再現・防御・理解） */
export function seals(states: Record<BadgeKind, SealState>, size: 'large' | 'small' = 'large'): HTMLElement {
  return h(
    'ul',
    { class: `seals seals-${size}`, 'aria-label': '達成印' },
    ...BADGE_KINDS.map((kind) =>
      h(
        'li',
        { class: 'seal', 'data-state': states[kind], title: `${BADGE_LABEL[kind]}：${BADGE_HINT[kind]}` },
        h('span', { class: 'seal-stamp', 'aria-hidden': true }, h('span', { class: 'seal-mark' }, SEAL_MARK[states[kind]]), h('span', { class: 'seal-label' }, BADGE_LABEL[kind])),
        h('span', { class: 'visually-hidden' }, `${BADGE_LABEL[kind]}：${SEAL_TEXT[states[kind]]}`),
      ),
    ),
  );
}

/** 記録の達成印を表示用の状態にする。防御は現在の構成で確認できたときだけ「済」 */
export function sealStates(attempt: AttemptRecord | undefined, defenseCurrent: boolean): Record<BadgeKind, SealState> {
  const badges = attempt?.badges;
  return {
    reproduction: badges?.reproduction.achieved ? 'done' : 'todo',
    defense: !badges?.defense.achieved ? 'todo' : defenseCurrent ? 'done' : 'stale',
    understanding: badges?.understanding.achieved ? 'done' : 'todo',
  };
}

/** 確認ダイアログ。Escape で閉じ、閉じたらフォーカスを元へ戻す */
export function confirmDialog(options: { title: string; body: string; confirm: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = h(
      'dialog',
      { class: 'dialog', 'aria-labelledby': 'dialog-title' },
      h('h2', { id: 'dialog-title' }, options.title),
      h('p', {}, options.body),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'button', on: { click: () => dialog.close('cancel') } }, options.cancel ?? 'やめる'),
        h('button', { type: 'button', class: `button ${options.danger ? 'button-danger' : 'button-primary'}`, on: { click: () => dialog.close('confirm') } }, options.confirm),
      ),
    );
    dialog.addEventListener('close', () => {
      dialog.remove();
      previous?.focus();
      resolve(dialog.returnValue === 'confirm');
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export interface TabSpec {
  id: string;
  label: string;
  panel: HTMLElement;
}

/**
 * タブ（WAI-ARIA の tablist）。左右の矢印キー・Home・End で切り替え、選んだタブだけを Tab キーで移動できる。
 * select でコードから切り替えられる
 */
export function tabs(name: string, specs: TabSpec[]): { element: HTMLElement; select(id: string): void } {
  const buttons = specs.map((spec, i) =>
    h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `tab-${spec.id}`,
        class: 'tab',
        'aria-controls': `panel-${spec.id}`,
        'aria-selected': i === 0 ? 'true' : 'false',
        tabIndex: i === 0 ? 0 : -1,
        on: { click: () => select(spec.id) },
      },
      spec.label,
    ),
  );
  const panels = specs.map((spec, i) => {
    spec.panel.id = `panel-${spec.id}`;
    spec.panel.setAttribute('role', 'tabpanel');
    spec.panel.setAttribute('aria-labelledby', `tab-${spec.id}`);
    spec.panel.tabIndex = 0;
    spec.panel.hidden = i !== 0;
    return spec.panel;
  });
  function select(id: string, focus = false): void {
    specs.forEach((spec, i) => {
      const selected = spec.id === id;
      buttons[i]!.setAttribute('aria-selected', String(selected));
      buttons[i]!.tabIndex = selected ? 0 : -1;
      panels[i]!.hidden = !selected;
      if (selected && focus) buttons[i]!.focus();
    });
  }
  const list = h('div', { role: 'tablist', 'aria-label': name, class: 'tablist' }, ...buttons);
  list.addEventListener('keydown', (e) => {
    const current = buttons.findIndex((b) => b === document.activeElement);
    if (current < 0) return;
    const last = buttons.length - 1;
    const next = { ArrowRight: current === last ? 0 : current + 1, ArrowLeft: current === 0 ? last : current - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(specs[next]!.id, true);
  });
  return { element: h('div', { class: 'tabs' }, list, ...panels), select: (id) => select(id) };
}
