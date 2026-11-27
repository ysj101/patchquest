// 検証する構成の組み立て。本物の Linux を動かすパックでは、時間の上限の倍率が付くことを確かめる
import { describe, expect, it } from 'vitest';
import { catalog } from '../../catalog';
import { MACHINE_TIME_SCALE, timeScaleFor, usesMachine, type MissionPack } from '../../platform/contract';
import { compatibleApp } from '../../platform/orchestrator/orchestrator';
import { buildSubject } from '../../platform/orchestrator/subject';

function subjectOf(pack: MissionPack) {
  const app = compatibleApp(catalog.apps, pack);
  if (!app) throw new Error(`${pack.manifest.id} に対応する教材アプリがない`);
  return buildSubject(app, pack, 'attempt-1', 3, {});
}

describe('検証する構成', () => {
  it('本物の Linux を動かすパック（linux-vm）だけ、時間の上限の倍率が付く', () => {
    const machinePacks = catalog.packs.filter((pack) => usesMachine(pack.manifest.runtime.capabilities));
    const others = catalog.packs.filter((pack) => !machinePacks.includes(pack));
    expect(machinePacks.length).toBeGreaterThan(0);
    expect(others.length).toBeGreaterThan(0);
    for (const pack of machinePacks) expect(subjectOf(pack).timeScale).toBe(MACHINE_TIME_SCALE);
    for (const pack of others) expect(subjectOf(pack)).not.toHaveProperty('timeScale');
  });

  it('倍率は必要機能から決まる', () => {
    expect(timeScaleFor(['sqlite', 'dom-preview'])).toBe(1);
    expect(timeScaleFor(['sqlite', 'linux-vm'])).toBe(4);
  });
});
