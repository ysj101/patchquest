// 学習UIの DOM を組み立てる補助。文字列は常にテキストノードとして入り、HTML として解釈されない（spec §6, §14）
type Child = Node | string | number | null | undefined | false;
type Handlers = { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };
type Attrs = { [key: string]: unknown; on?: Handlers };

/** HTML として解釈される・スクリプトを実行しうるプロパティは設定させない */
const FORBIDDEN_PROPERTIES = new Set(['innerHTML', 'outerHTML', 'srcdoc']);

/** 子として入れないもの（null・undefined・false）を捨て、数値を文字列にする */
function nodes(children: Child[]): (Node | string)[] {
  return children.filter((c): c is Node | string | number => c !== null && c !== undefined && c !== false).map((c) => (typeof c === 'number' ? String(c) : c));
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    // false は「付けない」の意味。ただし真偽値のプロパティ（spellcheck など）には、false をそのまま入れる
    if (value === false && typeof (el as unknown as Record<string, unknown>)[key] !== 'boolean') continue;
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
  el.append(...nodes(children));
  return el;
}

/** 子要素を入れ替える */
export function fill(el: Element, ...children: Child[]): void {
  el.replaceChildren(...nodes(children));
}

/** 表示に関わる値が変わったときだけ描き直すための判定（操作中のフォーカスや入力を失わないため） */
export function renderGuard(): { changed(key: string): boolean } {
  let last: string | undefined;
  return {
    changed(key) {
      if (key === last) return false;
      last = key;
      return true;
    },
  };
}

const pendingAnnouncements = new WeakMap<HTMLElement, string[]>();

/** 同じ領域へ、文を入れるフレームまでに届いた通知をまとめ、空にするフレームを挟んで読み上げる。 */
export function announce(region: HTMLElement, message: string): void {
  const pending = pendingAnnouncements.get(region);
  if (pending) {
    pending.push(message);
    return;
  }
  const messages = [message];
  pendingAnnouncements.set(region, messages);
  requestAnimationFrame(() => {
    region.textContent = '';
    // 空にしたあと文を入れるまでに届いた通知も、同じ文にまとめる（別にすると、先の文が描かれる前に消える）
    requestAnimationFrame(() => {
      pendingAnnouncements.delete(region);
      region.textContent = messages.join('。');
    });
  });
}
