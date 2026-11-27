// 文を句点（。）で区切る。画面は、区切りごとに行を改めて出す

/** 句点の直後にあれば、そこでは区切らない文字（閉じかっこは、句点と同じ行に残す） */
const CLOSING = '」』）';

/**
 * 句点（。）の直後で区切った文の並びを返す。つなげると元の文字列に戻る。
 * 丸かっこ（）の中の句点と、閉じかっこ（」』）の直前の句点では区切らない。補足の途中や、かっこだけの行を作らないようにするため。
 * かぎかっこ「」『』の中の文は区切る（引用が何文も続くことがあるため）
 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (char === '（') depth += 1;
    else if (char === '）') depth = Math.max(0, depth - 1);
    else if (char === '。' && depth === 0 && !CLOSING.includes(text.charAt(i + 1) || ' ')) {
      sentences.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) sentences.push(text.slice(start));
  return sentences;
}
