import { expect, openMissionList, test } from './fixtures';

test('ビルド成果物をlocalhostから開くと課題一覧が表示される', async ({ page }) => {
  expect(await openMissionList(page)).toEqual([]);
});
