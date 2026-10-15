// 演習の操作記録と達成印から、五つのステージの到達と現在地を導く。
import type { AttemptRecord } from '../contract';
import { sealStates } from './components';

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
