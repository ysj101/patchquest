// 同梱するパックと、基準となるテスト専用パックを、実ブラウザの検証インスタンスで出荷前検証する（spec §15）
const catalog = { apps: [...bundled.apps, testApp], packs: [...bundled.packs, testPack] };
import { catalog as bundled } from '../../catalog';
import { testApp } from '../support/test-app';
import { testPack } from '../support/test-pack';
import { Evaluator } from '../../platform/evaluator/evaluator';
import { compatibleApp } from '../../platform/orchestrator/orchestrator';
import { verifyPack, type PackVerification } from '../../platform/orchestrator/pack-verification';
import { BrowserRuntimeAdapter } from '../../runtimes/browser/adapter';

async function verifyAll(): Promise<PackVerification[]> {
  const evaluator = new Evaluator(() => new BrowserRuntimeAdapter({ assetsBase: new URL('/assets/', location.origin) }));
  const results: PackVerification[] = [];
  for (const pack of catalog.packs) {
    const app = compatibleApp(catalog.apps, pack);
    const { appId, versions } = pack.manifest.appCompatibility;
    results.push(app ? await verifyPack(pack, app, evaluator) : { packId: pack.manifest.id, ok: false, checks: [{ name: '対応する教材アプリ', ok: false, detail: `${appId} ${versions} がありません` }] });
  }
  await evaluator.dispose();
  return results;
}

declare global {
  interface Window {
    verifyAllPacks: typeof verifyAll;
  }
}
window.verifyAllPacks = verifyAll;
document.body.dataset.ready = 'true';
