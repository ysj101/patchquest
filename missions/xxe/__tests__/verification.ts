// XXE パックの開発用の検証データ。学習画面に出さない直し方を、共通の出荷前検証で確かめる。
// 実体を置き換えるオプションを外す直し方は合格し、特定の場所や書き方だけを断る直し方は不合格になる。配布物には含めない
import { XmlParseOption, type ParseImport } from '../../../apps/memo/hooks';
import type { PackVerificationData } from '../../../tests/support/verification-data';

const HOOK = 'memo.import.parse';

/** forbid に当たる XML だけを断り、ほかは注入した実装と同じオプションでパーサーに渡す */
const rejecting =
  (forbid: (source: string) => boolean): ParseImport =>
  (parse, source) =>
    forbid(source) ? { ok: false, error: '使えない文字が入っています', resources: [] } : parse(source, XmlParseOption.XML_PARSE_NOENT);

export const xxeVerification: PackVerificationData = {
  packId: 'xxe',
  implementations: {
    // オプションを何も付けない。libxml2 2.15.1 は、既定では外部実体を読まない
    'xxe/fix-default-options': { hook: HOOK, run: ((parse, source) => parse(source, 0)) satisfies ParseImport },
    // 問い合わせの設定ファイルの名前だけを断る
    'xxe/wrong-fix-env-only': { hook: HOOK, run: rejecting((source) => source.includes('.env')) },
    // file: という書き方だけを断る。場所だけを書いた指定は、そのまま読まれる
    'xxe/wrong-fix-file-scheme': { hook: HOOK, run: rejecting((source) => source.includes('file:')) },
  },
  // 直すのに足すオプション。調べ方には書かない
  answerTerms: ['XML_PARSE_NO_XXE'],
  candidates: [
    { id: 'fix-default-options', apply: [{ hook: HOOK, implementation: 'xxe/fix-default-options' }], expected: 'secure' },
    { id: 'wrong-fix-env-only', apply: [{ hook: HOOK, implementation: 'xxe/wrong-fix-env-only' }], expected: 'insufficient' },
    { id: 'wrong-fix-file-scheme', apply: [{ hook: HOOK, implementation: 'xxe/wrong-fix-file-scheme' }], expected: 'insufficient' },
  ],
};
