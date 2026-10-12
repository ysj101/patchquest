// テスト用の演習の記録（test-pack の構成）
import type { AttemptRecord } from '../../platform/contract';

export function makeAttempt(attemptId: string, overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptId,
    missionId: 'test-pack',
    missionVersion: '1.0.0',
    variantId: 'default',
    recipeId: 'any-owner',
    recipeVersion: '1.0.0',
    appId: 'test-app',
    appVersion: '1.0.0',
    seed: 42,
    fixtureHash: 'f'.repeat(64),
    createdAt: '2026-10-12T00:00:00Z',
    state: 'Prepared',
    configHash: 'c'.repeat(64),
    appliedDefense: null,
    badges: { reproduction: { achieved: false }, defense: { achieved: false }, understanding: { achieved: false } },
    lastVerification: null,
    hintsOpened: [],
    solutionViewed: false,
    answers: {},
    ...overrides,
  };
}
