// Evaluator の E2E 用ページ。検証専用の BrowserRuntimeAdapter（非表示のプレビュー）でテストを実行する
import { memoApp } from '../../apps/memo';
import type { TestCase } from '../../platform/contract';
import { Evaluator, type EvaluationSubject } from '../../platform/evaluator/evaluator';
import { BrowserRuntimeAdapter } from '../../runtimes/browser/adapter';
import { testPack } from '../support/test-pack';

const assetsBase = new URL('/assets/', location.origin);
const evaluator = new Evaluator(() => new BrowserRuntimeAdapter({ assetsBase }), { testTimeoutMs: 1000, suiteTimeoutMs: 20_000 });

const evaluatorTest = {
  memoTests: memoApp.tests,
  packCases: testPack.manifest.tests.cases,
  async runSuite(subject: EvaluationSubject, tests: TestCase[], target: string[], runId: string) {
    try {
      return { ok: true as const, report: await evaluator.runSuite(subject, tests, target, runId, 'hash') };
    } catch (e) {
      return { ok: false as const, code: (e as { code?: string }).code, message: String(e) };
    }
  },
  frames: () => [...document.querySelectorAll('iframe')].map((f) => ({ hidden: f.hidden, sandbox: f.getAttribute('sandbox') })),
};

declare global {
  interface Window {
    evaluatorTest: typeof evaluatorTest;
  }
}
window.evaluatorTest = evaluatorTest;
document.body.dataset.ready = 'true';
