// 実行結果から再現・防御・正常系の成否を判定する（spec §9, §11.2）。
// テストは演習用とは別の検証インスタンスで実行し、判定の根拠は実際の応答・観測イベントに限る
import {
  RuntimeError,
  hashJson,
  type Exchange,
  type ImplementationSelection,
  type ProbeDef,
  type ResultGroup,
  type RuntimeAdapter,
  type Step,
  type TestCase,
  type TestOutcome,
  type VerificationReport,
} from '../contract';
import { matchesExchange, runSteps, type ScenarioInvoker, type ScenarioResult, type Scope } from './scenario';

/** 検証する構成。演習開始時に固定した版・seed と、現在の実装の選択 */
export interface EvaluationSubject {
  attemptId: string;
  app: { id: string; version: string };
  fixture: { generator: string; seed: number };
  implementations: ImplementationSelection;
}

export interface EvaluatorLimits {
  /** テスト 1 件（全手順の合計）の上限（初期案 5 秒、spec §14） */
  testTimeoutMs: number;
  /** スイート全体の上限（初期案 60 秒） */
  suiteTimeoutMs: number;
}

export const DEFAULT_EVALUATOR_LIMITS: EvaluatorLimits = { testTimeoutMs: 5000, suiteTimeoutMs: 60_000 };

/** 攻撃阻止：target に含まれるテスト / 正常系 / 回帰：target 以外のセキュリティテスト */
export function groupOf(test: TestCase, target: readonly string[]): ResultGroup {
  if (target.includes(test.id)) return 'attack';
  return test.category === 'normal' ? 'normal' : 'regression';
}

/** 判定の前提になる構成のハッシュ。版や実装の選択が変わったら過去の合格を現在の合格として扱わない */
export function configHash(config: {
  missionId: string;
  missionVersion: string;
  recipeId: string;
  recipeVersion: string;
  app: { id: string; version: string };
  implementations: ImplementationSelection;
}): Promise<string> {
  return hashJson(config);
}

export function isCurrent(report: VerificationReport, currentConfigHash: string): boolean {
  return report.configHash === currentConfigHash;
}

/** プレイヤー自身の操作が攻撃の成立にあたるなら、その probe の ID を返す（事前検証の自動 probe とは区別する） */
export function detectReproduction(exchange: Exchange, probes: ProbeDef[], refs: Scope): string | null {
  return probes.find((p) => matchesExchange(exchange, p.detect, refs))?.id ?? null;
}

export interface ProbeOutcome {
  probeId: string;
  /** 攻撃が成立したか */
  succeeded: boolean;
  expected: string;
  actual: string;
  /** 基盤エラー（タイムアウトなど） */
  error?: string;
}

function invokerFor(runtime: RuntimeAdapter, runId: string, timeoutMs: number): ScenarioInvoker {
  return {
    session: async (actor) => (await runtime.invoke({ kind: 'session', actor }, { runId, timeoutMs })).session ?? null,
    request: async (session, request) => {
      const { response, events } = await runtime.invoke({ kind: 'request', session, request }, { runId, timeoutMs });
      return { response: response!, events };
    },
    render: async (session, view) => ({ events: (await runtime.invoke({ kind: 'render', session, view }, { runId, timeoutMs })).events }),
  };
}

export class Evaluator {
  private runtime: RuntimeAdapter | undefined;
  /** いま検証インスタンスが準備されている構成。呼び出し側は 1 回の検証の間、同じオブジェクトを渡す */
  private preparedFor: EvaluationSubject | undefined;
  private generation = 0;
  /** 検証インスタンスは 1 つなので、実行は 1 件ずつ順に行う */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    /** 検証専用の実行環境を作る。演習用のインスタンスとは共有しない */
    private readonly createRuntime: () => RuntimeAdapter,
    private readonly limits: EvaluatorLimits = DEFAULT_EVALUATOR_LIMITS,
  ) {}

  /**
   * テスト群を実行する。各テストの前に初期データへ戻し、前の操作の副作用が結果に影響しないようにする。
   * 新しい検証が始まったら古い検証は stopped で終わり、結果を返さない
   */
  runSuite(subject: EvaluationSubject, tests: TestCase[], target: readonly string[], runId: string, hash: string): Promise<VerificationReport> {
    const generation = ++this.generation;
    return this.exclusive(() => this.suite(generation, subject, tests, target, runId, hash));
  }

  /** 攻撃の成立条件を自動で確かめる（事前検証用）。プレイヤーの達成には数えない */
  runProbes(subject: EvaluationSubject, probes: ProbeDef[], runId: string): Promise<ProbeOutcome[]> {
    const generation = ++this.generation;
    return this.exclusive(async () => {
      const outcomes: ProbeOutcome[] = [];
      for (const probe of probes) {
        this.assertCurrent(generation);
        const { passed, ...rest } = await this.run(subject, probe.steps, runId);
        outcomes.push({ probeId: probe.id, succeeded: passed, ...rest });
      }
      this.assertCurrent(generation);
      return outcomes;
    });
  }

  async dispose(): Promise<void> {
    this.generation++;
    await this.tail;
    await this.runtime?.dispose();
    this.runtime = undefined;
    this.preparedFor = undefined;
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work, work);
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async suite(
    generation: number,
    subject: EvaluationSubject,
    tests: TestCase[],
    target: readonly string[],
    runId: string,
    hash: string,
  ): Promise<VerificationReport> {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const outcomes: TestOutcome[] = [];
    for (const test of tests) {
      this.assertCurrent(generation);
      if (performance.now() - started > this.limits.suiteTimeoutMs) {
        throw new RuntimeError('timeout', `検証が ${this.limits.suiteTimeoutMs / 1000} 秒以内に終わりませんでした`);
      }
      const result = await this.run(subject, test.steps, runId);
      this.assertCurrent(generation);
      outcomes.push({ testId: test.id, title: test.title, group: groupOf(test, target), ...result });
    }
    return {
      runId,
      attemptId: subject.attemptId,
      configHash: hash,
      outcomes,
      passed: outcomes.every((o) => o.passed),
      startedAt,
      elapsedMs: performance.now() - started,
    };
  }

  /** 1 件分の手順を初期データから実行する。基盤エラーは不合格（error 付き）として返し、偽の合格にしない */
  private async run(subject: EvaluationSubject, steps: Step[], runId: string): Promise<ScenarioResult & { error?: string }> {
    try {
      const runtime = await this.ensureRuntime(subject);
      const { refs } = await runtime.reset();
      // 呼び出しごとの上限もテスト全体の上限と同じにし、テスト全体はさらに withTimeout で抑える
      return await this.withTimeout(runSteps(steps, refs, invokerFor(runtime, runId, this.limits.testTimeoutMs)), runtime);
    } catch (e) {
      if (!(e instanceof RuntimeError)) throw e;
      // 実行環境が止まったので、次のテストの前に準備し直す
      this.preparedFor = undefined;
      return { passed: false, expected: '時間内に実行を終える', actual: e.message, error: e.code };
    }
  }

  private async withTimeout<T>(work: Promise<T>, runtime: RuntimeAdapter): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // 先に結果を確定させてから、実行中の処理を止める（停止による stopped を結果にしない）
        reject(new RuntimeError('timeout', `テストが ${this.limits.testTimeoutMs / 1000} 秒以内に終わりませんでした`));
        void runtime.stop();
      }, this.limits.testTimeoutMs);
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureRuntime(subject: EvaluationSubject): Promise<RuntimeAdapter> {
    if (!this.runtime) {
      this.runtime = this.createRuntime();
      await this.runtime.start();
    }
    if (this.preparedFor !== subject) {
      await this.runtime.prepare(subject);
      this.preparedFor = subject;
    }
    return this.runtime;
  }

  private assertCurrent(generation: number): void {
    if (generation !== this.generation) throw new RuntimeError('stopped', '新しい検証が始まったため中止しました');
  }
}
