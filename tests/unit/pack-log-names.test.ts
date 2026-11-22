// 課題パックの文章が「観測ログの「名前」」の形で名指しする項目名が、教材アプリの観測ログに実際に出る名前であること。
// アプリ側で表示の文言を変えたときに、それを名指ししているパックの文章が古くなったことに気づく
import { describe, expect, it } from 'vitest';
import type { MissionManifest } from '../../platform/contract';
import { compatibleApp } from '../../platform/orchestrator/orchestrator';
import { catalog } from '../support/catalog';
import { samplePack } from '../support/sample-pack';

const LOG_NAME = /観測ログの「([^」]+)」/g;

/** パックの文章（マニフェストのどこでも）が名指しする観測ログの項目名 */
const namedLogNames = (manifest: MissionManifest): string[] => [...JSON.stringify(manifest).matchAll(LOG_NAME)].flatMap((match) => match.slice(1));

/** パックの文章が名指しする観測ログの項目名のうち、アプリが宣言していないもの */
function unknownLogNames(manifest: MissionManifest, labels: readonly string[]): string[] {
  return namedLogNames(manifest).filter((name) => !labels.includes(name));
}

describe('パックの文章が名指しする観測ログの項目名', () => {
  it.each(catalog.packs)('$manifest.id が名指しする項目名は、対応する教材アプリの観測ログに出る', (pack) => {
    const app = compatibleApp(catalog.apps, pack);
    if (!app) throw new Error(`${pack.manifest.id} に対応する版の教材アプリがありません`);
    expect(unknownLogNames(pack.manifest, app.eventLabels ?? [])).toEqual([]);
  });

  it('sudo-misconfig のヒントは、観測ログの「プログラムの実行」を名指しし、擬似シェルはその名前で表示する', () => {
    const pack = catalog.packs.find((candidate) => candidate.manifest.id === 'sudo-misconfig');
    const app = pack && compatibleApp(catalog.apps, pack);
    if (!pack || !app) throw new Error('sudo-misconfig と、対応する教材アプリがカタログにありません');
    expect(namedLogNames(pack.manifest)).toContain('プログラムの実行');
    expect(app.describeEvent?.({ type: 'shell.exec', data: { program: '/bin/x', user: 'u', runAs: 'root' } })).toMatch(/^プログラムの実行：/);
  });

  it('アプリの表示にない項目名を名指ししていれば、その名前を返す', () => {
    const { manifest } = samplePack();
    manifest.solution = '観測ログの「プログラムの実行」と、観測ログの「古い名前」を見る';
    expect(unknownLogNames(manifest, ['プログラムの実行'])).toEqual(['古い名前']);
    expect(unknownLogNames(manifest, [])).toEqual(['プログラムの実行', '古い名前']);
  });
});
