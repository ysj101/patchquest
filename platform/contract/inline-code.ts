// 教材の文に書く短いコード（`…` で囲んだコマンドなど）を見分ける。HTML として解釈せず、文字のまま扱う

/** 文の一部。code が true なら、`…` で囲んだコードの部分 */
export interface TextPart {
  code: boolean;
  text: string;
}

/**
 * `…` で囲んだ部分をコード、残りを地の文として、出てくる順に返す。
 * ` の数が奇数、または中身が空のコード（`` や ` `）があれば、書き誤りとして null を返す
 */
export function splitInlineCode(text: string): TextPart[] | null {
  const pieces = text.split('`');
  if (pieces.length % 2 === 0) return null;
  const parts: TextPart[] = [];
  for (const [index, piece] of pieces.entries()) {
    const code = index % 2 === 1;
    if (code && piece.trim() === '') return null;
    if (piece !== '') parts.push({ code, text: piece });
  }
  return parts;
}
