// 埋め込みページ（AppModule.embeds）を指す URL の # 以降。形は「アプリ ID/名前/渡す文字列」で、各部分は URL 用に符号化する
const SEPARATOR = '/';

export interface EmbedTarget {
  appId: string;
  name: string;
  /** 埋め込みページへそのまま渡す文字列。なければ空 */
  param: string;
}

/** 埋め込みページを指す、# から始まる文字列を作る */
export function embedHash(target: EmbedTarget): string {
  return `#${[target.appId, target.name, target.param].map(encodeURIComponent).join(SEPARATOR)}`;
}

/** # が付いていなければ null（教材アプリの画面そのもの）。付いているのに形が合わなければ、黙って画面として動かさずに止める */
export function parseEmbed(hash: string): EmbedTarget | null {
  if (hash === '' || hash === '#') return null;
  const parts = hash.slice(1).split(SEPARATOR).map(decodeURIComponent);
  const [appId, name, param] = parts;
  if (parts.length !== 3 || !appId || !name || param === undefined) throw new Error(`埋め込みページの指定が読めません: ${hash}`);
  return { appId, name, param };
}
