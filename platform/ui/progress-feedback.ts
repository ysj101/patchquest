// 進捗の取り込み結果と、保存できないときの案内を画面の文言に整える。
import type { ImportResult } from '../progress/store';
import { h } from './dom';
import { PROFILE_RECOMPUTED } from './labels';

/** 保存できない理由と、設定の「進捗を書き出す」への案内 */
export function storageWarningBanner(reason: string, openSettings: () => void): HTMLElement {
  return h(
    'div',
    { class: 'banner banner-warn', role: 'status' },
    h('p', {}, `${reason}。進捗はこの画面を閉じると消えるため、設定の「進捗を書き出す」で保存してください。`),
    h('button', { type: 'button', class: 'button', on: { click: openSettings } }, '設定を開く'),
  );
}

export function importMessage(result: ImportResult): string {
  if (!result.ok) return `進捗を読み込めませんでした：${result.error}`;
  const warning = result.profileRecomputed ? '。' + PROFILE_RECOMPUTED : '';
  return `進捗を ${result.imported} 件読み込みました${warning}`;
}

export function importBanner(result: ImportResult): HTMLElement | null {
  if (!result.ok) return h('p', { class: 'banner banner-error', role: 'alert' }, `進捗を読み込めませんでした。今の進捗はそのままです。（${result.error}）`);
  return result.profileRecomputed ? h('p', { class: 'banner banner-warn', role: 'status' }, PROFILE_RECOMPUTED) : null;
}
