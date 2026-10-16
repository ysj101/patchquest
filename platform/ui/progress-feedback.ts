// 進捗取り込みの結果を一覧の通知と警告に整える。
import type { ImportResult } from '../progress/store';
import { h } from './dom';
import { PROFILE_RECOMPUTED } from './labels';

export function importMessage(result: ImportResult): string {
  if (!result.ok) return `進捗を読み込めませんでした：${result.error}`;
  const warning = result.profileRecomputed ? '。' + PROFILE_RECOMPUTED : '';
  return `進捗を ${result.imported} 件読み込みました${warning}`;
}

export function importBanner(result: ImportResult): HTMLElement | null {
  if (!result.ok) return h('p', { class: 'banner banner-error', role: 'alert' }, `進捗を読み込めませんでした。今の進捗はそのままです。（${result.error}）`);
  return result.profileRecomputed ? h('p', { class: 'banner banner-warn', role: 'status' }, PROFILE_RECOMPUTED) : null;
}
