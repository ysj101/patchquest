// 教材アプリの画面を組み立てる小さな補助。文字列は append でテキストとして入るため HTML として解釈されない
import { splitSentences } from '../../platform/contract';

type Child = Node | string;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: object = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** 案内文を句点（。）ごとに分け、文と文のあいだに改行を入れた子の並び。案内文を入れる要素の子に使う（利用者が書いたデータには使わない） */
export function sentenceLines(text: string): Child[] {
  return splitSentences(text).flatMap((sentence, i) => (i === 0 ? [sentence] : [document.createElement('br'), sentence]));
}
