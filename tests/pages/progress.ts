// ProgressStore の E2E 用ページ。実ブラウザの IndexedDB に保存する
import type { AttemptRecord } from '../../platform/contract';
import { ProgressStore } from '../../platform/progress/store';

const store = await ProgressStore.open({ missionIds: [], categories: {} });

const progressTest = {
  reason: () => store.unavailableReason,
  save: (attempt: AttemptRecord) => store.save(attempt),
  ids: async () => (await store.list()).map((a) => a.attemptId),
  exportJson: () => store.exportJson(),
  importJson: (text: string) => store.importJson(text),
  clear: () => store.clear(),
};

declare global {
  interface Window {
    progressTest: typeof progressTest;
  }
}
window.progressTest = progressTest;
document.body.dataset.ready = 'true';
