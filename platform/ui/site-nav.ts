// サイトの見出しに置く移動（課題 / 記録）。いまの画面を aria-current で示し、キーボードでそのまま押せる
import { h } from './dom';

export type SitePage = 'list' | 'records';

const PAGES: { id: SitePage; label: string }[] = [
  { id: 'list', label: '課題' },
  { id: 'records', label: '記録' },
];

export function siteNav(open: (page: SitePage) => void): { element: HTMLElement; select(page: SitePage | null): void } {
  const buttons = PAGES.map((page) => ({ id: page.id, button: h('button', { type: 'button', class: 'site-link', 'data-page': page.id, on: { click: () => open(page.id) } }, page.label) }));
  return {
    element: h('nav', { class: 'site-nav', 'aria-label': 'ページ' }, ...buttons.map(({ button }) => button)),
    /** 演習中など、どちらのページでもないときは null */
    select(page) {
      for (const { id, button } of buttons) {
        if (id === page) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
    },
  };
}
