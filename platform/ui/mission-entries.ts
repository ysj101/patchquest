// 一覧に出す課題（ベータ版は設定で表示を有効にしたときだけ）を選び、保存済みの記録から、各課題の表示状態（直近の記録・続きから始められるか・完了した記録があるか）を導く
import { catalog } from '@catalog';
import { satisfies, type AttemptRecord, type MissionPack } from '../contract';
import { hasCompleted, type MissionEntry } from './mission-table';

const appVersionOf = (appId: string) => catalog.apps.find((app) => app.descriptor.id === appId)?.descriptor.version ?? '';

/** 画面に出す課題。ベータ版は showBeta のときだけ含める。隠した課題の記録は消さない */
export const visiblePacks = (showBeta: boolean): MissionPack[] => catalog.packs.filter((pack) => showBeta || pack.manifest.release !== 'beta');

/** 一覧に出す課題と、その表示状態。URL から課題を開くときもここから探すので、隠したベータ版は URL でも開けない */
export function missionEntries(records: readonly AttemptRecord[], showBeta: boolean): MissionEntry[] {
  return visiblePacks(showBeta).map((pack) => {
    const own = records.filter((record) => record.missionId === pack.manifest.id);
    const latest = own.at(-1);
    const resumable = !!latest && latest.missionVersion === pack.manifest.version && satisfies(appVersionOf(latest.appId), pack.manifest.appCompatibility.versions);
    return { pack, latest, resumable, completed: hasCompleted(own) };
  });
}
