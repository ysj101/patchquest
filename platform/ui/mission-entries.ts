// 保存済みの記録から、課題一覧の各課題の表示状態（直近の記録・続きから始められるか・完了した記録があるか）を導く
import { catalog } from '@catalog';
import { satisfies, type AttemptRecord } from '../contract';
import { hasCompleted, type MissionEntry } from './mission-table';

const appVersionOf = (appId: string) => catalog.apps.find((app) => app.descriptor.id === appId)?.descriptor.version ?? '';

export function missionEntries(records: readonly AttemptRecord[]): MissionEntry[] {
  return catalog.packs.map((pack) => {
    const own = records.filter((record) => record.missionId === pack.manifest.id);
    const latest = own.at(-1);
    const resumable = !!latest && latest.missionVersion === pack.manifest.version && satisfies(appVersionOf(latest.appId), pack.manifest.appCompatibility.versions);
    return { pack, latest, resumable, completed: hasCompleted(own) };
  });
}
