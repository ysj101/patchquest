// Node のユニットテスト用の RuntimeAdapter。Worker やプレビューを使わず AppEngine を直接動かす（描画はしない）
import { RuntimeError, type FixtureData, type InvokeCall, type InvokeResult, type PrepareOptions, type RuntimeAdapter } from '../../platform/contract';
import { Evaluator } from '../../platform/evaluator/evaluator';
import { AppEngine } from '../../runtimes/browser/engine';
import { readMachineAsset } from './machine-assets';

export class EngineRuntime implements RuntimeAdapter {
  readonly id = 'engine';
  readonly capabilities = ['sqlite', 'linux-vm'] as const;
  private readonly engine = new AppEngine(readMachineAsset);

  prepare(options: PrepareOptions): Promise<FixtureData> {
    return this.engine.prepare(options);
  }

  async start(): Promise<void> {}

  async invoke(call: InvokeCall): Promise<InvokeResult> {
    if (call.kind === 'render') throw new RuntimeError('not-prepared', 'Node では画面を描画しない');
    return this.engine.invoke(call);
  }

  async setImplementation(hook: string, implementation: string): Promise<void> {
    this.engine.setImplementation(hook, implementation);
  }

  reset(): Promise<FixtureData> {
    return this.engine.reset();
  }

  async stop(): Promise<void> {}

  dispose(): Promise<void> {
    return this.engine.dispose();
  }
}

/** Node の実行環境で検証する Evaluator。使い終わったら dispose する */
export const nodeEvaluator = (): Evaluator => new Evaluator(() => new EngineRuntime());

/**
 * 演習用の機械（本物の Linux）を動かす検証のための Evaluator。テストを並べて走らせると、エミュレータが CPU を取り合って
 * 1 件が製品の上限（5 秒）を超えることがある。ここで確かめるのは結果の正しさなので、時間の上限を広げる
 */
export const machineEvaluator = (): Evaluator => new Evaluator(() => new EngineRuntime(), { testTimeoutMs: 60_000, suiteTimeoutMs: 600_000 });
