// 同梱するパックと、基準となるテスト専用パックを、実ブラウザの検証インスタンスで出荷前検証する（spec §15）。
// 初期データの違いで結果が変わらないことも確かめるため、複数の seed で検証する。パックの開発用の検証データにある
// 検証専用の対策候補（誤った修正など）も確かめる。E2E はパック 1 つずつ呼び出す
import { verificationCandidates } from '../support/catalog';
import { verificationCatalog as catalog } from '../support/verification-catalog';
import { Evaluator } from '../../platform/evaluator/evaluator';
import { compatibleApp } from '../../platform/orchestrator/orchestrator';
import { VERIFICATION_SEEDS, verifyPack, type PackVerification } from '../../platform/orchestrator/pack-verification';
import { BrowserRuntimeAdapter } from '../../runtimes/browser/adapter';

async function verifyOnePack(packId: string): Promise<PackVerification[]> {
  const pack = catalog.packs.find((candidate) => candidate.manifest.id === packId);
  if (!pack) throw new Error(`検証の対象にないパックです：${packId}`);
  const evaluator = new Evaluator(() => new BrowserRuntimeAdapter({ assetsBase: new URL('/assets/', location.origin) }));
  const app = compatibleApp(catalog.apps, pack);
  const { appId, versions } = pack.manifest.appCompatibility;
  const results: PackVerification[] = [];
  for (const seed of VERIFICATION_SEEDS) {
    results.push(
      app
        ? await verifyPack(pack, app, evaluator, seed, verificationCandidates(pack.manifest.id))
        : { packId, seed, ok: false, checks: [{ name: '対応する教材アプリ', ok: false, detail: `${appId} ${versions} がありません` }] },
    );
  }
  await evaluator.dispose();
  return results;
}

declare global {
  interface Window {
    verifyPackById: typeof verifyOnePack;
  }
}
window.verifyPackById = verifyOnePack;
document.body.dataset.ready = 'true';
