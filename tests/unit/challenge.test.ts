// 別条件での挑戦（チャレンジ）の記録が残る演習で、出す理解確認の設問が記録どおりに決まることを確かめる。
import { expect, it } from 'vitest';
import { askedQuestions } from '../../platform/contract';
import { idorPack } from '../../missions/idor';

const ids = idorPack.manifest.transferCheck.map((question) => question.id);
const [, second] = ids as [string, string];

it('通常の演習は全問、チャレンジは記録の設問だけを返し、パックにない設問なら止める', () => {
  expect(askedQuestions(idorPack.manifest, { challenge: null })).toHaveLength(ids.length);
  expect(askedQuestions(idorPack.manifest, { challenge: { questionIds: [second], repeatsPrevious: false } }).map((question) => question.id)).toEqual([second]);
  expect(() => askedQuestions(idorPack.manifest, { challenge: { questionIds: ['missing'], repeatsPrevious: false } })).toThrow('チャレンジの設問（missing）がパックにありません');
});
