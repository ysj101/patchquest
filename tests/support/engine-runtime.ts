// Node のユニットテスト用の RuntimeAdapter。Worker やプレビューを使わず AppEngine を直接動かす（描画はしない）
import { RuntimeError, type FixtureData, type InvokeCall, type InvokeResult, type PrepareOptions, type RuntimeAdapter } from '../../platform/contract';
import { AppEngine } from '../../runtimes/browser/engine';

export class EngineRuntime implements RuntimeAdapter {
  readonly id = 'engine';
  readonly capabilities = ['sqlite'] as const;
  private readonly engine = new AppEngine();

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

  async dispose(): Promise<void> {}
}
