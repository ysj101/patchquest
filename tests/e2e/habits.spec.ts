// 課題一覧には「取り組み」を出さない。記録ページは習熟度と実績を残し、外した機能へは案内しない。
import type { Page } from '@playwright/test';
import { expect, importProgressFile, openHome, openRecords, test } from './fixtures';

async function expectNoRemovedGuide(page: Page): Promise<void> {
  for (const text of ['復習クエスト', '週間目標', '別条件で挑戦', 'XP は取り組み']) {
    await expect(page.getByText(text)).toHaveCount(0);
  }
}

test('課題一覧には次の一歩と課題の表があり、取り組みと別条件の挑戦は出ない', async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole('heading', { level: 1, name: '課題', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /まずは練習/ })).toBeVisible();
  await expect(page.locator('.mission-section')).toBeVisible();
  await expect(page.getByRole('region', { name: '取り組み', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '復習クエスト', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '週間目標', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '別条件で挑戦する' })).toHaveCount(0);
  await expect(page.locator('.mission-list .xp-summary')).toHaveCount(0);

  await openRecords(page);
  await expect(page.getByRole('heading', { level: 1, name: '記録', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '取り組み', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '習熟度', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '実績', exact: true })).toBeVisible();
  const records = page.locator('.records-page');
  await expect(records.locator('.hero-lead')).toContainText('★1 → ★2 → ★3');
  await expectNoRemovedGuide(page);
});

const savedChallenge = {
  format: 'patchquest-progress',
  schemaVersion: 9,
  exportedAt: '2026-10-20T00:00:00.000Z',
  attempts: [
    {
      attemptId: 'challenge-1',
      missionId: 'test-pack',
      missionVersion: '1.0.0',
      variantId: 'default',
      recipeId: 'any-owner',
      recipeVersion: '1.0.0',
      appId: 'test-app',
      appVersion: '1.0.0',
      seed: 42,
      fixtureHash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      createdAt: '2026-10-12T00:00:00Z',
      state: 'Passed',
      configHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      appliedDefense: null,
      milestones: { briefedAt: null, firstRequestAt: null, firstDefenseAt: null },
      badges: { reproduction: { achieved: true }, defense: { achieved: true }, understanding: { achieved: true } },
      lastVerification: null,
      history: [],
      firstPass: null,
      verifications: 0,
      normalBroken: false,
      hintsOpened: [],
      solutionViewed: false,
      answers: {},
      challenge: { questionIds: ['owner-check'], repeatsPrevious: false },
    },
  ],
  profile: {
    xp: { total: 0 },
    reviews: [{ at: '2026-10-12T03:00:00.000Z', missionId: 'test-pack', questionId: 'q1', correct: true }],
    weeklyGoal: 'few',
  },
};

test('過去のチャレンジ記録を取り込んでも記録ページは表示され、外した機能へは案内しない', async ({ page }) => {
  await importProgressFile(page, savedChallenge, '記録から計算し直しました');
  await openRecords(page);
  await expect(page.getByRole('heading', { level: 1, name: '記録', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '習熟度', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '実績', exact: true })).toBeVisible();
  const authorization = page.locator('.records-page li').filter({ has: page.locator('.mastery-line[data-category="authorization"]') });
  await authorization.locator('summary').click();
  await expect(authorization.locator('.mastery-evidence-list li').first()).toBeVisible();
  await expect(page.getByText('復習の正答：1 問')).toBeVisible();
  await expectNoRemovedGuide(page);
});
