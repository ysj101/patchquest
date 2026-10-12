// 教材アプリの画面を組み立てる小さな補助。文字列は append でテキストとして入るため HTML として解釈されない
type Child = Node | string;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: object = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
