// 別条件での挑戦（チャレンジ）の記録が残る演習を続きから始めると、記録の設問だけで理解を判定することを確かめる。
import { expect, it } from 'vitest';
import type { MissionPack } from '../../platform/contract';
import { Evaluator } from '../../platform/evaluator/evaluator';
import { Orchestrator } from '../../platform/orchestrator/orchestrator';
import { makeAttempt } from '../support/attempt';
import { EngineRuntime } from '../support/engine-runtime';
import { nodePack } from '../support/node-pack';
import { testApp } from '../support/test-app';

/** test-pack の理解確認に 2 問目を足したパック。チャレンジはそのうち 1 問だけを出す */
const twoQuestions: MissionPack = {
  ...nodePack,
  manifest: {
    ...nodePack.manifest,
    transferCheck: [
      ...nodePack.manifest.transferCheck,
      { id: 'q2', situation: '別の状況', prompt: 'どれが有効か', choices: [{ id: 'bind', label: '値として扱う', correct: true, explanation: '' }, { id: 'ban', label: '語を禁止', correct: false, explanation: '' }] },
    ],
  },
};

it('別条件での挑戦の記録を続きから始めると、記録の設問だけで理解を判定し、出題の条件と seed を保つ', async () => {
  const orchestrator = new Orchestrator({ evaluator: new Evaluator(() => new EngineRuntime()), exercise: new EngineRuntime(), apps: [testApp], packs: [twoQuestions] });
  const { attempt } = await orchestrator.start('test-pack', { resume: makeAttempt('挑戦', { seed: 7, challenge: { questionIds: ['q2'], repeatsPrevious: false } }) });
  expect(attempt.seed).toBe(7);
  expect(attempt.challenge).toEqual({ questionIds: ['q2'], repeatsPrevious: false });
  // 出していない q1 の回答は求めず、q2 だけで判定する
  expect(orchestrator.answerTransfer({ q2: 'ban' })).toBe(false);
  expect(orchestrator.answerTransfer({ q2: 'bind' })).toBe(true);
  expect(attempt.badges.understanding.achieved).toBe(true);
});

it('通常の演習は challenge が null で、全問に正解しないと理解の達成印が付かない', async () => {
  const orchestrator = new Orchestrator({ evaluator: new Evaluator(() => new EngineRuntime()), exercise: new EngineRuntime(), apps: [testApp], packs: [twoQuestions] });
  const { attempt } = await orchestrator.start('test-pack');
  expect(attempt.challenge).toBeNull();
  expect(orchestrator.answerTransfer({ q1: 'owner' })).toBe(false);
  expect(orchestrator.answerTransfer({ q1: 'owner', q2: 'bind' })).toBe(true);
});
