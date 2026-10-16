// 課題一覧の進捗の道具（書き出し・読み込み・削除）。保存先と画面の更新・読み上げ・ガイドの出来事をつなぐ
import type { ProgressStore } from '../progress/store';
import { confirmDialog } from './components';
import type { GuidePanel } from './guide';
import { downloadProgress } from './progress-download';
import { importBanner, importMessage } from './progress-feedback';

export interface ProgressActionDeps {
  store: ProgressStore;
  listView: HTMLElement;
  guide: GuidePanel;
  showList: (message?: string) => Promise<void>;
  announce: (message: string) => void;
}

export function progressActions({ store, listView, guide, showList, announce }: ProgressActionDeps) {
  async function exportProgress(): Promise<void> {
    await downloadProgress(store);
    announce('進捗を書き出しました');
    guide.reach('exported');
  }

  async function importProgress(file: File): Promise<void> {
    const result = await store.importJson(await file.text());
    await showList(importMessage(result));
    const banner = importBanner(result);
    if (banner) listView.querySelector('.progress-tools')?.append(banner);
  }

  async function clearProgress(): Promise<void> {
    const ok = await confirmDialog({
      title: '進捗をすべて削除しますか？',
      body: 'このブラウザに保存した達成印と記録がすべて消えます。必要なら先に書き出してください。',
      confirm: '削除する',
      danger: true,
    });
    if (!ok) return;
    await store.clear();
    await showList('進捗を削除しました');
  }

  return { exportProgress, importProgress, clearProgress };
}
