// 操作ガイドの文字と案内先が、実際の画面で隠れていないことを確かめる。
import { expect } from '@playwright/test';

/** @param {import('@playwright/test').Locator} text */
async function expectReadableText(text) {
  await expect(text).toBeVisible();
  const placement = await text.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const header = globalThis.document.querySelector('.site-header')?.getBoundingClientRect();
    const band = element.closest('.guide')?.getBoundingClientRect();
    if (!header || !band) throw new Error('サイト見出しと操作ガイドが必要です');
    const hit = globalThis.document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      text: element.textContent,
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      viewport: box.left >= 0 && box.top >= 0 && box.right <= globalThis.innerWidth && box.bottom <= globalThis.innerHeight,
      band: box.left >= band.left && box.top >= band.top && box.right <= band.right && box.bottom <= band.bottom,
      header: !(box.left < header.right && box.right > header.left && box.top < header.bottom && box.bottom > header.top),
      uncovered: hit !== null && element.contains(hit),
      visible: element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
    };
  });
  expect(placement, 'ガイドの文字全体が帯と画面に収まり、サイト見出しや他の要素に隠れない').toMatchObject({
    viewport: true, band: true, header: true, uncovered: true, visible: true,
  });
}

/**
 * ガイドの出現が終わってから、見出し・本文・補足を検査する。target は「場所を表示」の後に指定する。
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 * @param {boolean} [target]
 */
export async function expectGuide(page, title, target = false) {
  const guide = page.getByRole('complementary', { name: '操作ガイド' });
  await expect(guide.getByRole('heading', { level: 3 })).toHaveText(title, { timeout: 20_000 });
  await guide.evaluate(async (element) => {
    const finite = element.getAnimations({ subtree: true }).filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((animation) => animation.finished));
  });
  await expect(guide.locator('.guide-bubble > p:not(.guide-praise):not(.guide-retry)'), 'ガイドには本文が一つある').toHaveCount(1);
  const texts = guide.locator('.guide-bubble h3, .guide-bubble p');
  for (const text of await texts.all()) await expectReadableText(text);
  if (target) {
    const marked = page.locator('[data-guide-target]');
    await expect(marked, '案内先の印が一か所にある').toHaveCount(1);
    await expect(marked, '案内先へスクロールして操作できる').toBeInViewport();
    const uncovered = await marked.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const left = Math.max(0, box.left);
      const right = Math.min(globalThis.innerWidth, box.right);
      const top = Math.max(0, box.top);
      const bottom = Math.min(globalThis.innerHeight, box.bottom);
      const hit = globalThis.document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      return hit !== null && element.contains(hit);
    });
    expect(uncovered, '画面内の案内先の中心がガイドや他の要素に隠れない').toBe(true);
    if (await page.locator('html').getAttribute('data-motion') === 'on') {
      expect(await marked.evaluate((element) => globalThis.getComputedStyle(element).animationName), '案内先が明るさを変えて示される').toContain('guide-pulse');
    }
  }
}
