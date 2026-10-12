// 学習UIの DOM を組み立てる補助。文字列は常にテキストノードとして入り、HTML として解釈されない（spec §6, §14）
type Child = Node | string | number | null | undefined | false;
type Handlers = { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };
export type Attrs = { [key: string]: unknown; on?: Handlers };

/** HTML として解釈される・スクリプトを実行しうるプロパティは設定させない */
const FORBIDDEN_PROPERTIES = new Set(['innerHTML', 'outerHTML', 'srcdoc']);

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'on') {
      for (const [type, handler] of Object.entries(value as Handlers)) el.addEventListener(type, handler as EventListener);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (key.startsWith('aria-') || key.startsWith('data-') || key === 'role' || key === 'for') {
      el.setAttribute(key, value === true ? 'true' : String(value));
    } else {
      if (FORBIDDEN_PROPERTIES.has(key) || key.startsWith('on')) throw new Error(`h() では ${key} を設定できません`);
      (el as unknown as Record<string, unknown>)[key] = value;
    }
  }
  el.append(...children.filter((c): c is Node | string | number => c !== null && c !== undefined && c !== false).map((c) => (typeof c === 'number' ? String(c) : c)));
  return el;
}

/** 子要素を入れ替える */
export function fill(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  el.append(...children.filter((c): c is Node | string | number => c !== null && c !== undefined && c !== false).map((c) => (typeof c === 'number' ? String(c) : c)));
}

/** 画面読み上げにも伝わる通知（aria-live）。表示は控えめに行う */
export function announce(region: HTMLElement, message: string): void {
  region.textContent = '';
  // 同じ文言でも読み上げられるよう、次のフレームで入れ直す
  requestAnimationFrame(() => (region.textContent = message));
}
