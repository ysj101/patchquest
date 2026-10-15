// 進捗 JSON を端末へ書き出すためのダウンロードを開始する。
import type { ProgressStore } from '../progress/store';
import { h } from './dom';

export async function downloadProgress(store: ProgressStore): Promise<void> {
  const blob = new Blob([await store.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: `patchquest-progress-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
