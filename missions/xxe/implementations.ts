// XXE パックの実装。外部実体まで読みに行くパーサーの呼び出し（注入）と、不十分な対策・正常系を壊す対策。
// 正しい対策（外部実体の読み込みを禁じるオプションを足す）は、教材アプリの基準実装 memo/import-no-xxe を使う。
// パーサーは本物の libxml2（WASM）。読ませるファイルは、初期データがメモリの中に作った架空のものだけ
import type { ImplementationRegistry } from '../../platform/contract';
import { XmlParseOption, type ParseImport } from '../../apps/memo/hooks';

const { XML_PARSE_NOENT, XML_PARSE_NONET } = XmlParseOption;

/** 注入する脆弱な実装。実体を置き換えるオプションだけを付ける。libxml2 は、外部実体が指す資源も読みに行く */
const importNoent: ParseImport = (parse, source) => parse(source, XML_PARSE_NOENT);

/** 対策（不十分）。ネットワークからの読み込みを禁じる。サーバの中のファイルは、ネットワークを通らないので読まれる */
const importNonet: ParseImport = (parse, source) => parse(source, XML_PARSE_NOENT | XML_PARSE_NONET);

/** 対策（正常系が壊れる）。パーサーを呼ばずに、取り込みを断る。ファイルは読まれないが、ふつうの XML も取り込めない */
const importDisabled: ParseImport = () => ({ ok: false, error: '取り込みは停止しています', resources: [] });

export const IMPLEMENTATIONS: ImplementationRegistry = {
  'xxe/import-noent': { hook: 'memo.import.parse', run: importNoent },
  'xxe/import-nonet': { hook: 'memo.import.parse', run: importNonet },
  'xxe/import-disabled': { hook: 'memo.import.parse', run: importDisabled },
};
