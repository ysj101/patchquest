// 操作記録と達成印から、ステージの到達・現在地と達成印の表示状態を導く。
import type { AttemptRecord, BadgeKind } from '../contract';


export const STAGES = [
  { id: 'briefed', label: '事件を確認' },
  { id: 'investigated', label: '手がかりを探す' },
  { id: 'reproduced', label: '脆弱性を再現' },
  { id: 'repaired', label: '対策する' },
  { id: 'verified', label: '最終検証' },
] as const;

/** 現在地は最初の未到達。順不同で到達しても、達成印や他のステージを変更しない。 */
export function stageStates(attempt: AttemptRecord, defenseCurrent: boolean) {
  const { milestones } = attempt;
  const seals = sealStates(attempt, defenseCurrent);
  const reached = [
    milestones.briefedAt !== null,
    milestones.firstRequestAt !== null,
    seals.reproduction === 'done',
    milestones.firstDefenseAt !== null,
    seals.defense === 'done' && seals.understanding === 'done',
  ];
  const current = reached.indexOf(false);
  return STAGES.map((stage, index) => ({ ...stage, state: reached[index] ? 'done' as const : 'todo' as const, current: index === current }));
}

/** 達成印の状態。stale は記録上は達成しているが、現在の構成では未確認 */
export type SealState = 'done' | 'todo' | 'stale';

/** 記録の達成印を表示用の状態にする。防御は現在の構成で確認できたときだけ「済」 */
export function sealStates(attempt: AttemptRecord | undefined, defenseCurrent: boolean): Record<BadgeKind, SealState> {
  const badges = attempt?.badges;
  const defense = defenseCurrent ? 'done' : 'stale';
  return {
    reproduction: badges?.reproduction.achieved ? 'done' : 'todo',
    defense: badges?.defense.achieved ? defense : 'todo',
    understanding: badges?.understanding.achieved ? 'done' : 'todo',
  };
}

/** 達成印の最後の時刻。時刻のない達成印しかなければ演習の作成時刻に遡る */
export function achievedAt(attempt: AttemptRecord): string {
  const times = Object.values(attempt.badges).flatMap((badge) => badge.at ?? []).sort();
  return times.at(-1) ?? attempt.createdAt;
}

/** 再現・防御・理解の達成印が記録上すべて揃っているか。現在の対策の合否とは独立。 */
export function allBadgesAchieved(attempt: AttemptRecord): boolean {
  return Object.values(attempt.badges).every((badge) => badge.achieved);
}
