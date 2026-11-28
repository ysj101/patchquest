// 課題「終わらない入力チェックを直す」（ReDoS、Issue #238）の固有のテスト。テストはリクエストだけなので、
// Node の実行環境で複数の seed の出荷前検証まで確かめる。合否が、経過時間ではなくエンジンの処理の上限で決まることも確かめる
import { describe, expect, it } from 'vitest';
import { memoApp } from '../../../apps/memo';
import { NAME_PATTERN } from '../../../apps/memo/profile';
import { redosPack } from '..';
import type { Exchange } from '../../../platform/contract';
import { detectReproduction } from '../../../platform/evaluator/evaluator';
import type { CatalogApp } from '../../../platform/orchestrator/orchestrator';
import { VERIFICATION_SEEDS, verifyPack } from '../../../platform/orchestrator/pack-verification';
import { REGEX_ASSET, RegexEngine } from '../../../runtimes/browser/regex';
import { nodeEvaluator } from '../../../tests/support/engine-runtime';
import { readMachineAsset } from '../../../tests/support/machine-assets';
import { requestOnly } from '../../../tests/support/request-only';
import { NESTED_PATTERN } from '../implementations';
import { redosVerification } from './verification';

/** 打ち切られる照合（1 回あたり 0.1 秒ほど）を何度も行うテストの時間の上限。ほかのテストと並んで走ると、既定の 5 秒では足りないことがある */
const SLOW_TEST_MS = 60_000;

const app: CatalogApp = { ...memoApp, tests: requestOnly(memoApp.tests) };

describe.each(VERIFICATION_SEEDS)('ReDoS パック（seed %i）', (seed) => {
  it('出荷前検証に合格する。注入で照合が打ち切られ、書き直しは全合格、打ち切りを通す・! だけ断るは攻撃が残り、縮める・止めるは正常系が壊れる', async () => {
    const evaluator = nodeEvaluator();
    const result = await verifyPack(redosPack, app, evaluator, seed, redosVerification.candidates);
    await evaluator.dispose();
    expect(result.checks.filter((check) => !check.ok)).toEqual([]);
  }, SLOW_TEST_MS);
});

describe('注入する正規表現と、基準の正規表現', () => {
  /** alphabet の文字でできた、長さ max までのすべての文字列 */
  function* strings(alphabet: string[], max: number): Generator<string> {
    yield '';
    if (max === 0) return;
    for (const rest of strings(alphabet, max - 1)) for (const char of alphabet) yield char + rest;
  }

  it('受け入れる表示名は同じ（6 文字までの総当たり）。違うのは、断るまでに試す回数だけ', async () => {
    const regex = await RegexEngine.load(await readMachineAsset(REGEX_ASSET), 10_000_000);
    const accepts = (pattern: string, name: string) => regex.match(pattern, name).outcome === 'match';
    const differing = [...new Set(strings(['a', '7', '.', '_', '!'], 6))].filter((name) => accepts(NESTED_PATTERN, name) !== accepts(NAME_PATTERN, name));
    expect(differing).toEqual([]);
  }, SLOW_TEST_MS);
});

describe('再現の判定', () => {
  const change = (status: number, outcome: string): Exchange => ({
    runId: 'r1',
    actor: 'bob',
    kind: 'request',
    request: { method: 'PUT', path: '/api/me', body: { name: 'aaaaaaaaaaaaaaaaaaa!' } },
    response: { status, body: {} },
    events: [{ type: 'regex.match', data: { outcome } }],
  });

  it('照合がエンジンの処理の上限で打ち切られたやり取りだけが、再現にあたる。断られただけでは再現にならない', () => {
    expect(detectReproduction(change(503, 'limit'), redosPack.manifest.probes, {})).toBe('check-aborted');
    expect(detectReproduction(change(400, 'no-match'), redosPack.manifest.probes, {})).toBeNull();
    expect(detectReproduction(change(200, 'limit'), redosPack.manifest.probes, {})).toBeNull();
  });
});
