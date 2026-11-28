// 課題「書き換えたトークンを断る」（Issue #237）の固有のテスト。出荷前検証（全 seed・対策の期待・誤った修正）は
// 共通の検証（tests/unit/pack-verification.test.ts・verify:packs）が確かめるので、ここではそれより細かい期待だけを確かめる
import { describe, expect, it } from 'vitest';
import { memoApp } from '../../../apps/memo';
import { jwtSignaturePack } from '..';
import type { Exchange } from '../../../platform/contract';
import { detectReproduction } from '../../../platform/evaluator/evaluator';
import type { CatalogApp } from '../../../platform/orchestrator/orchestrator';
import { VERIFICATION_SEEDS } from '../../../platform/orchestrator/pack-verification';
import { defenseSuite } from '../../../tests/support/defense-suite';
import { requestOnly } from '../../../tests/support/request-only';

const app: CatalogApp = { ...memoApp, tests: requestOnly(memoApp.tests) };
const { manifest } = jwtSignaturePack;
const { defense, failures } = defenseSuite(app, jwtSignaturePack);

describe.each(VERIFICATION_SEEDS)('署名を確かめないトークン（seed %i）', (seed) => {
  it('署名が付いているかを見るだけでは、でたらめな署名のトークンが通って不合格になる。「署名なし」のトークンは断れる', async () => {
    const failed = await failures(defense('require-signature'), seed);
    expect(failed.map((outcome) => outcome.testId).sort()).toEqual(['jwt-signature.forged.cross-users', 'jwt-signature.forged.new-memo', 'memo.token.forged-denied']);
    expect(failed.every((outcome) => outcome.group === 'attack')).toBe(true);
    expect(failed.find((outcome) => outcome.testId === 'memo.token.forged-denied')?.actual).toContain('実際は 200');
  });

  it('トークンをすべて断ると、本人が自分のトークンでメモを取り出せず、合格しない', async () => {
    const failed = await failures(defense('reject-all'), seed);
    expect(failed.map((outcome) => outcome.testId).sort()).toEqual(['jwt-signature.own.all-users', 'jwt-signature.own.without-session', 'memo.token.own']);
    expect(failed.every((outcome) => outcome.group === 'normal')).toBe(true);
  });
});

describe('再現の判定', () => {
  const refs = { 'users.alice.id': 602, 'users.bob.id': 618, 'users.carol.id': 648 };
  const exchange = (actor: string, userId: number, signatureValid: boolean, status = 200): Exchange => ({
    runId: 'r1',
    actor,
    kind: 'request',
    request: { method: 'POST', path: '/api/token/memos', body: { token: 'x.y.z' } },
    response: { status, body: status === 200 ? { user: { id: userId }, memos: [] } : { error: '断った' } },
    events: [{ type: 'token.checked', data: { decision: status === 200 ? 'accept' : 'reject', reason: '', subject: 'x', signatureValid } }],
  });

  it('署名の合わないトークンで別の利用者のメモを受け取ったら、名乗られた利用者の probe で再現とみなす', () => {
    expect(detectReproduction(exchange('bob', 602, false), manifest.probes, refs)).toBe('forge-alice-token');
    expect(detectReproduction(exchange('anonymous', 618, false), manifest.probes, refs)).toBe('forge-bob-token');
    expect(detectReproduction(exchange('alice', 648, false), manifest.probes, refs)).toBe('forge-carol-token');
  });

  it('自分のトークンでの取り出し・署名の合うトークン・断られた要求は、再現にしない', () => {
    expect(detectReproduction(exchange('bob', 618, true), manifest.probes, refs)).toBeNull();
    // 自分の名前のまま中身の書き方だけを変えたトークン（署名は合わないが、他人のメモは返っていない）
    expect(detectReproduction(exchange('bob', 618, false), manifest.probes, refs)).toBeNull();
    // 本人から預かった、署名の合うトークン
    expect(detectReproduction(exchange('bob', 602, true), manifest.probes, refs)).toBeNull();
    expect(detectReproduction(exchange('bob', 602, false, 401), manifest.probes, refs)).toBeNull();
  });
});
