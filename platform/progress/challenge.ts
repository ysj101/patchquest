// 別条件での挑戦（チャレンジ）の条件を、同じ課題の保存済みの記録から決める。
// 新しい seed、前回と違う variant、出題回数の少ない理解確認の設問を選ぶ。脆弱性の種類は変えない（spec §5.3, §5.4）
import type { AttemptRecord, ChallengeInfo, MissionPack } from '../contract';

export interface ChallengePlan {
  variantId: string;
  seed: number;
  challenge: ChallengeInfo;
}

const MAX_SEED_TRIES = 100;

/** 演習の seed と同じ 32 ビットの乱数 */
function cryptoSeed(): number {
  const [seed] = crypto.getRandomValues(new Uint32Array(1));
  if (seed === undefined) throw new Error('乱数を取得できませんでした');
  return seed;
}

/** 同じ課題で使ったことのない seed を引く。偶然の衝突は引き直し、引き直し続けるなら止める */
function freshSeed(used: ReadonlySet<number>, randomSeed: () => number): number {
  for (let index = 0; index < MAX_SEED_TRIES; index++) {
    const seed = randomSeed();
    if (!used.has(seed)) return seed;
  }
  throw new Error('新しい seed を選べませんでした');
}

/** variant が複数あれば前回の次を、1 つしかなければそれを使う */
function nextVariant(pack: MissionPack, previous: AttemptRecord | undefined): string {
  const { variants } = pack.manifest.fixtures;
  const first = variants[0];
  if (!first) throw new Error(`課題 ${pack.manifest.id} に variant がありません`);
  const index = variants.findIndex((variant) => variant.id === previous?.variantId);
  return variants[(index + 1) % variants.length]?.id ?? first.id;
}

/** 過去の記録で出した設問 ID。旧版のパックで出した、いまの版にない設問は数えない（止めずに挑戦を続けられるようにする） */
function askedIds(pack: MissionPack, record: AttemptRecord): string[] {
  const known = pack.manifest.transferCheck.map((question) => question.id);
  return record.challenge === null ? known : record.challenge.questionIds.filter((id) => known.includes(id));
}

/** 出題回数が最も少ない設問から 1 問。同数なら seed で選ぶので、同じ記録と seed なら同じ設問になる */
function pickQuestion(pack: MissionPack, records: readonly AttemptRecord[], seed: number): string {
  const { transferCheck } = pack.manifest;
  const counts = new Map(transferCheck.map((question) => [question.id, 0]));
  for (const record of records) {
    for (const id of askedIds(pack, record)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const fewest = Math.min(...counts.values());
  const candidates = transferCheck.filter((question) => counts.get(question.id) === fewest);
  const picked = candidates[seed % candidates.length];
  if (!picked) throw new Error(`課題 ${pack.manifest.id} に理解確認の設問がありません`);
  return picked.id;
}

/**
 * チャレンジの条件を決める。records はこの課題の記録（順不同でよい）。
 * 設問は前回と違うものを選ぶが、全問を出し終えていれば同じ設問を出し直し、repeatsPrevious で知らせる
 */
export function planChallenge(pack: MissionPack, records: readonly AttemptRecord[], randomSeed: () => number = cryptoSeed): ChallengePlan {
  const mission = records.filter((record) => record.missionId === pack.manifest.id).sort((first, second) => first.createdAt.localeCompare(second.createdAt));
  const previous = mission.at(-1);
  const seed = freshSeed(new Set(mission.map((record) => record.seed)), randomSeed);
  const questionId = pickQuestion(pack, mission, seed);
  const repeatsPrevious = previous !== undefined && askedIds(pack, previous).includes(questionId);
  return { variantId: nextVariant(pack, previous), seed, challenge: { questionIds: [questionId], repeatsPrevious } };
}
