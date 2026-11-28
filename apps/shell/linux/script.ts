// 機械の中で実行するシェルスクリプトを組み立てるための部品。初期データの反映（provision.ts）と、初期データが足す準備のスクリプトで使う

const ESCAPED_QUOTE = String.raw`'\''`;
/** シェルの 1 語として、そのままの文字列を渡す */
export const quote = (value: string): string => `'${value.replaceAll("'", ESCAPED_QUOTE)}'`;

/** 内容を、コマンドの標準入力へヒアドキュメントで渡す（終わりの印は、内容に現れない行にする）。内容の末尾には改行が 1 つ付く */
export function heredoc(command: string, content: string): string[] {
  let marker = 'PQ_END';
  while (content.split('\n').includes(marker)) marker += '_';
  return [`${command} <<'${marker}'`, content, marker];
}
