// サーバが描く画面（HTML の文字列）を組み立てる補助。値は必ず esc を通して、文字として入れる
import { splitSentences } from '../../platform/contract';

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML の本文と属性値（引用符で囲んだもの）に、文字として入れられる形にする */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

/** 案内文を句点（。）ごとに分け、文と文のあいだに改行を入れた HTML にする（利用者が書いたデータには使わない） */
export function sentenceHtml(text: string): string {
  return splitSentences(text).map(esc).join('<br>');
}
