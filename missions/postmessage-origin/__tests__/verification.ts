// 「送信元を確かめない postMessage」パックの開発用の検証データ。調べ方のカードに答えを書いていないことを確かめるための語を持つ。配布物には含めない
import type { PackVerificationData } from '../../../tests/support/verification-data';

export const postmessageOriginVerification: PackVerificationData = {
  packId: 'postmessage-origin',
  implementations: {},
  candidates: [],
  answerTerms: ['event.source', 'contentWindow'],
};
