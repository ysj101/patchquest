// 設定の進捗の道具（書き出し・読み込み・削除）。保存先と画面の更新・読み上げ・ガイドの出来事をつなぐ
import type { ProgressStore } from '../progress/store';
import { confirmDialog } from './components';
import type { GuidePanel } from './guide';
import { downloadProgress } from './progress-download';
import { importBanner, importMessage } from './progress-feedback';

export interface ProgressToolActions {
  exportProgress(): void;
  importProgress(file: File): void;
  clearProgress(): void;
}

export interface ProgressActionDeps {
  store: ProgressStore;
  /** 進捗の道具を含む要素。読み込みの注記は、その中の .progress-tools に添える */
  view: ParentNode;
  guide: GuidePanel;
  /** 開いている一覧を描き直す。設定を開いたままならフォーカスは動かさない */
  refresh: (message?: string) => Promise<void>;
  announce: (message: string) => void;
}

export function progressActions({ store, view, guide, refresh, announce }: ProgressActionDeps) {
  /** いま出している読み込みの注記。次の読み込みで入れ替える */
  let note: HTMLElement | null = null;

  async function exportProgress(): Promise<void> {
    await downloadProgress(store);
    announce('進捗を書き出しました');
    guide.reach('exported');
  }

  async function importProgress(file: File): Promise<void> {
    const result = await store.importJson(await file.text());
    await refresh(importMessage(result));
    note?.remove();
    note = importBanner(result);
    if (note) view.querySelector('.progress-tools')?.append(note);
  }

  async function clearProgress(): Promise<void> {
    const ok = await confirmDialog({
      title: '進捗をすべて削除しますか？',
      body: 'このブラウザに保存したスタンプと記録が、すべて消えます。必要なら先に書き出してください。',
      confirm: '削除する',
      danger: true,
    });
    if (!ok) return;
    await store.clear();
    await refresh('進捗を削除しました');
  }

  return { exportProgress, importProgress, clearProgress };
}
