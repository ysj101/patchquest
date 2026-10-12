// 自由入力の HTML がフレーム自体を遷移させて外部へ通信しないよう、HTML として描画する前に
// 許可した要素・属性だけを残す。on* の実行可否は CSP のハッシュで決まる（docs/poc/xss-isolation.md）
interface TrustedTypePolicy {
  createHTML(input: string): unknown;
}
interface TrustedTypePolicyFactory {
  createPolicy(name: string, rules: { createHTML: (s: string) => string }): TrustedTypePolicy;
}

const ALLOWED_ELEMENTS = new Set(['B', 'I', 'EM', 'STRONG', 'U', 'S', 'SMALL', 'MARK', 'CODE', 'SPAN', 'P', 'BR', 'UL', 'OL', 'LI', 'IMG', 'svg']);
const isAllowedAttribute = (el: Element, name: string) =>
  name.startsWith('on') || name === 'alt' || name === 'title' || (name === 'src' && el.tagName === 'IMG');

/**
 * innerHTML への代入すべてに遷移ガードをかける。Trusted Types があれば default ポリシーで、
 * ない環境では innerHTML の setter を差し替えて同じ許可リストを通す。enabled が false の間は素通しにする
 */
export function installNavigationGuard(enabled: () => boolean = () => true): void {
  // 未対応のブラウザでは識別子そのものが存在しないため、window のプロパティとして参照する
  const trustedTypes = (window as { trustedTypes?: TrustedTypePolicyFactory }).trustedTypes;
  // DOMParser.parseFromString も Trusted Types の対象のため、default ポリシーの中で文字列を渡すと
  // default ポリシー自身が再び呼ばれる。解析用に何もしない別ポリシーを通す
  const inert = trustedTypes?.createPolicy('pq-inert', { createHTML: (s) => s });

  const guard = (html: string): string => {
    if (!enabled()) return html;
    const doc = new DOMParser().parseFromString((inert?.createHTML(html) ?? html) as string, 'text/html');
    for (const el of [...doc.body.querySelectorAll('*')]) {
      if (!ALLOWED_ELEMENTS.has(el.tagName)) {
        el.remove();
        continue;
      }
      for (const { name } of [...el.attributes]) if (!isAllowedAttribute(el, name)) el.removeAttribute(name);
    }
    return doc.body.innerHTML;
  };

  if (trustedTypes) {
    trustedTypes.createPolicy('default', { createHTML: guard });
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!;
  Object.defineProperty(Element.prototype, 'innerHTML', {
    ...descriptor,
    set(this: Element, html: string) {
      descriptor.set!.call(this, guard(String(html)));
    },
  });
}
