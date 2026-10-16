// 保存済みの記録から、課題一覧の各課題の表示状態（直近の記録・続きから始められるか・防御が現在の合格か）を導く
import { catalog } from '@catalog';
import { satisfies, type AttemptRecord } from '../contract';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { hasCompleted, type MissionEntry } from './mission-table';

const appVersionOf = (appId: string) => catalog.apps.find((app) => app.descriptor.id === appId)?.descriptor.version ?? '';

/** live は画面で進行中の演習。防御が現在の合格なのは、この画面で検証した演習だけで、保存した記録は再検証するまで確定しない */
export function missionEntries(records: readonly AttemptRecord[], live: ExerciseSnapshot | null): MissionEntry[] {
  return catalog.packs.map((pack) => {
    const own = records.filter((record) => record.missionId === pack.manifest.id);
    const latest = own.at(-1);
    const resumable = !!latest && latest.missionVersion === pack.manifest.version && satisfies(appVersionOf(latest.appId), pack.manifest.appCompatibility.versions);
    const defenseCurrent = !!latest && live?.attempt.attemptId === latest.attemptId && live.defenseCurrent;
    return { pack, latest, resumable, defenseCurrent, completed: hasCompleted(own) };
  });
}
