// メモの取り込みで使う XML の見本と、サーバの中のファイル（架空）の場所。画面・アプリ共通のテスト・課題パックが同じものを使う

/** 取り込む XML の大きさの上限（入力 1 件 4KB、spec §14） */
export const IMPORT_MAX_LENGTH = 4000;
/** 1 回に取り込めるメモの数 */
export const IMPORT_MAX_MEMOS = 20;

/** 取り込んだ XML の、サーバの中での場所。相対的に書かれた資源の場所は、ここを基準に決まる */
export const IMPORT_URL = 'file:///srv/memo/uploads/import.xml';

/** サーバの中のファイル（架空）。中身は初期データが seed から作る */
export const SERVER_FILES = {
  /** サーバの名前。秘密ではないが、利用者に見せるものでもない */
  hostname: '/etc/hostname',
  /** アプリの設定。メール用のパスワードが書いてある */
  env: '/srv/memo/.env',
} as const;

const DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

const document = (doctype: string, title: string, body: string) =>
  [DECLARATION, ...(doctype ? [doctype] : []), '<memos>', '  <memo>', `    <title>${title}</title>`, `    <body>${body}</body>`, '  </memo>', '</memos>'].join('\n');

/** ふつうの XML。取り込みの画面の「見本を入れる」が入れる */
export const PLAIN_MEMO = { title: '引っ越しの準備', body: '段ボールを 10 箱もらう' };
export const PLAIN_XML = document('', PLAIN_MEMO.title, PLAIN_MEMO.body);

/** 文書の中で決めた実体（内部実体）を使う XML。&sign; が「田中より」に置き換わる */
export const ENTITY_MEMO = { title: 'お礼の下書き', body: '先日はありがとうございました。田中より' };
export const ENTITY_XML = document('<!DOCTYPE memos [\n  <!ENTITY sign "田中より">\n]>', ENTITY_MEMO.title, '先日はありがとうございました。&sign;');

/** 外部実体（別の資源を指す実体）を使う XML。systemId が、読ませる資源の場所 */
export const externalEntityXml = (systemId: string): string =>
  document(`<!DOCTYPE memos [\n  <!ENTITY file SYSTEM "${systemId}">\n]>`, '取り込みの確認', '&file;');

/** パラメーター実体（DTD の中で使う実体）で外部の資源を指す XML。本文には出ないが、パーサーは資源を読みに行く */
export const parameterEntityXml = (systemId: string): string =>
  document(`<!DOCTYPE memos [\n  <!ENTITY % file SYSTEM "${systemId}">\n  %file;\n]>`, '取り込みの確認', '本文');
