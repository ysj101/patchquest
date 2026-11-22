// 開始前チェックの基準状態で、実行環境が動かなかったときの知らせ方。テストの題名を並べず、止まった理由を示す
import { expect, it } from 'vitest';
import { RuntimeError } from '../../platform/contract';
import { Evaluator } from '../../platform/evaluator/evaluator';
import { Orchestrator } from '../../platform/orchestrator/orchestrator';
import { EngineRuntime } from '../support/engine-runtime';
import { nodePack } from '../support/node-pack';
import { testApp } from '../support/test-app';

/** 準備のたびに、同じ理由で止まる実行環境（演習用の機械の配布物を読めないときなど） */
class BrokenRuntime extends EngineRuntime {
  override prepare(): never {
    throw new RuntimeError('crashed', '演習用の機械の配布物 linux.state.zst を読めません（404）');
  }
}

it('基準状態のテストを実行環境が動かせなかったら、止まった理由を 1 つにまとめ、件数を添えて示す', async () => {
  const orchestrator = new Orchestrator({
    apps: [testApp],
    packs: [nodePack],
    evaluator: new Evaluator(() => new BrokenRuntime()),
    exercise: new EngineRuntime(),
    randomSeed: () => 4242,
    newId: () => 'attempt-1',
    now: () => new Date('2026-10-12T00:00:00Z'),
  });
  const snapshot = await orchestrator.start('test-pack');
  const count = testApp.tests.length + nodePack.manifest.tests.cases.length;
  expect(snapshot.blocked).toEqual({ kind: 'platform-error', message: `安全な基準状態のテストを実行できませんでした: 演習用の機械の配布物 linux.state.zst を読めません（404）（${count} 件）` });
  expect(snapshot.preflight.at(-1)).toMatchObject({ step: 'baseline', status: 'failed' });
});
