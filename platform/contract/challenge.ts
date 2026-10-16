// 別条件での挑戦（チャレンジ）で出す理解確認の設問。記録に出題した設問 ID があればその設問だけ、なければ全問を出す
import type { AttemptRecord } from './attempt';
import type { MissionManifest, TransferQuestion } from './manifest';

/** この演習で出す理解確認の設問。チャレンジの記録が指す設問がパックにないときは、版違いの記録なので止める */
export function askedQuestions(manifest: MissionManifest, attempt: Pick<AttemptRecord, 'challenge'>): TransferQuestion[] {
  const { challenge } = attempt;
  if (challenge === null) return manifest.transferCheck;
  const asked = manifest.transferCheck.filter((question) => challenge.questionIds.includes(question.id));
  if (asked.length === 0) throw new Error(`チャレンジの設問（${challenge.questionIds.join('、')}）がパックにありません`);
  return asked;
}
