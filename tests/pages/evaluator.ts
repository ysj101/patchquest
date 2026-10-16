// Evaluator の E2E 用ページ。検証専用の BrowserRuntimeAdapter（非表示のプレビュー）でテストを実行する
import { memoApp } from '../../apps/memo';
import type { TestCase } from '../../platform/contract';
import { DEFAULT_EVALUATOR_LIMITS, Evaluator, type EvaluationSubject, type EvaluatorLimits } from '../../platform/evaluator/evaluator';
import { BrowserRuntimeAdapter } from '../../runtimes/browser/adapter';
import { testPack } from '../support/test-pack';
import { settle } from './shared/settle';

const assetsBase = new URL('/assets/', location.origin);
/** 上限ごとに Evaluator を 1 つ使い回す。同じ上限の呼び出しは製品と同じく 1 件ずつ順に実行される */
const evaluators = new Map<string, Evaluator>();
function evaluatorFor(limits: EvaluatorLimits): Evaluator {
  const key = JSON.stringify(limits);
  let evaluator = evaluators.get(key);
  if (!evaluator) {
    evaluator = new Evaluator(() => new BrowserRuntimeAdapter({ assetsBase }), limits);
    evaluators.set(key, evaluator);
  }
  return evaluator;
}

const evaluatorTest = {
  memoTests: memoApp.tests,
  packCases: testPack.manifest.tests.cases,
  /**
   * 製品と同じ上限（テスト 1 件 5 秒、spec §14）で実行する。終わらないテストの確認だけは、
   * E2E の所要時間を抑えるために短い上限を渡す。描画の手順など通常のテストに短い上限を使うと、
   * 実行環境の負荷で偽のタイムアウトになる（A18）
   */
  runSuite: (subject: EvaluationSubject, tests: TestCase[], target: string[], runId: string, limits: Partial<EvaluatorLimits> = {}) =>
    settle(evaluatorFor({ ...DEFAULT_EVALUATOR_LIMITS, ...limits }).runSuite(subject, tests, target, runId, 'hash')),
  frames: () => [...document.querySelectorAll('iframe')].map((f) => ({ hidden: f.hidden, sandbox: f.getAttribute('sandbox') })),
};

declare global {
  interface Window {
    evaluatorTest: typeof evaluatorTest;
  }
}
window.evaluatorTest = evaluatorTest;
document.body.dataset.ready = 'true';
