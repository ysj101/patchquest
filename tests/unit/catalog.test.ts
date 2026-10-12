// 同梱するカタログ（配布物に入る教材）の整合。パックは対応する教材アプリの契約に合っていなければならない
import { describe, expect, it } from 'vitest';
import { catalog } from '../../catalog';
import { satisfies, validatePack } from '../../platform/contract';

describe('同梱カタログ', () => {
  it.each(catalog.packs.map((pack) => [pack.manifest.id, pack] as const))('%s は契約の検証に合格する', (_id, pack) => {
    const { appId, versions } = pack.manifest.appCompatibility;
    const app = catalog.apps.find((a) => a.descriptor.id === appId && satisfies(a.descriptor.version, versions));
    expect(app, `${appId} ${versions} に合う教材アプリ`).toBeDefined();
    expect(
      validatePack(pack, { app: app!.descriptor, appTestIds: app!.tests.map((t) => t.id), sharedImplementations: app!.implementations }),
    ).toEqual([]);
  });
});
