// カタログに登録されたすべてのパックを、実ブラウザの検証インスタンスで出荷前検証する（spec §15）
import { catalog } from '@catalog';
import { satisfies } from '../../platform/contract';
import { Evaluator } from '../../platform/evaluator/evaluator';
import { verifyPack, type PackVerification } from '../../platform/orchestrator/pack-verification';
import { BrowserRuntimeAdapter } from '../../runtimes/browser/adapter';

async function verifyAll(): Promise<PackVerification[]> {
  const evaluator = new Evaluator(() => new BrowserRuntimeAdapter({ assetsBase: new URL('/assets/', location.origin) }));
  const results: PackVerification[] = [];
  for (const pack of catalog.packs) {
    const { appId, versions } = pack.manifest.appCompatibility;
    const app = catalog.apps.find((a) => a.descriptor.id === appId && satisfies(a.descriptor.version, versions));
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
