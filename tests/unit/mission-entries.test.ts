// ベータ版の課題を、設定で表示を有効にしたときだけ一覧・URL・記録ページの対象にし、実績「全課題」には数えないことを確かめる。
// カタログはテスト用（tests/support/catalog.ts）で、ベータ版は test-beta だけ
import { describe, expect, it } from 'vitest';
import { missionEntries, visiblePacks } from '../../platform/ui/mission-entries';
import { profileOptions } from '../../platform/ui/profile-options';
import { makeAttempt } from '../support/attempt';

const ids = (showBeta: boolean) => visiblePacks(showBeta).map((pack) => pack.manifest.id);

describe('ベータ版の課題の表示', () => {
  it('表示を有効にしていなければ、ベータ版の課題を出さない', () => {
    expect(ids(false)).not.toContain('test-beta');
    expect(ids(false)).toContain('test-pack');
    expect(visiblePacks(false).map((pack) => pack.manifest.release)).not.toContain('beta');
  });

  it('表示を有効にすると、ベータ版の課題も同梱の順のまま出す', () => {
    expect(ids(true).filter((id) => id !== 'test-beta')).toEqual(ids(false));
    expect(ids(true)).toContain('test-beta');
  });

  it('一覧の行も同じ課題だけにし、隠したベータ版は記録があっても出さない', () => {
    const records = [makeAttempt('ベータ版の演習', { missionId: 'test-beta' })];
    expect(missionEntries(records, false).map((entry) => entry.pack.manifest.id)).toEqual(ids(false));
    const shown = missionEntries(records, true).find((entry) => entry.pack.manifest.id === 'test-beta');
    expect(shown?.latest?.attemptId).toBe('ベータ版の演習');
  });

  it('実績「全課題」にはベータ版を数えず、習熟度の分類には含める', () => {
    expect(profileOptions.missionIds).not.toContain('test-beta');
    expect(profileOptions.missionIds).toContain('test-pack');
    expect(profileOptions.categories['test-beta']).toBe('authorization');
  });
});
