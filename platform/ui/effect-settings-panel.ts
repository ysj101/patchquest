// 設定のモーダル。演出の変更はすぐ適用し、進捗の書き出し・読み込み・削除もここから行う。
import { bindReason } from './browser-effects';
import { radioOption, showDialog } from './components';
import { h } from './dom';
import type { EffectSettings, EffectSettingsStore } from './effect-settings';
import type { ProgressToolActions } from './progress-actions';

/** 進捗の書き出し・読み込み・削除。保存先の注記はここだけに置く */
function progressTools(actions: ProgressToolActions): HTMLElement {
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'visually-hidden',
    tabIndex: -1,
    'aria-hidden': true,
    on: {
      change: () => {
        const file = fileInput.files?.[0];
        if (file) actions.importProgress(file);
        fileInput.value = '';
      },
    },
  });
  return h(
    'section',
    { class: 'progress-tools', 'aria-labelledby': 'progress-tools-title', 'data-anchor': 'progress-export' },
    h('h3', { id: 'progress-tools-title' }, '進捗'),
    h('p', { class: 'note' }, '進捗はこのブラウザの中だけに保存されます。別のブラウザへ移すときは書き出したファイルを読み込みます。'),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'button', on: { click: () => actions.exportProgress() } }, '進捗を書き出す'),
      h('button', { type: 'button', class: 'button', on: { click: () => fileInput.click() } }, '進捗を読み込む'),
      h('button', { type: 'button', class: 'button button-danger', on: { click: () => actions.clearProgress() } }, '進捗をすべて削除'),
      fileInput,
    ),
  );
}

/** 設定を開く。閉じた後に入口へフォーカスを戻し、演出の購読を解除する。 */
export function openSettings(store: EffectSettingsStore, progress: ProgressToolActions): void {
  const settings = store.effectSettings();
  const warning = h('p', { role: 'status', class: 'note' });
  const update = (change: Partial<EffectSettings>) => store.update({ ...store.effectSettings(), ...change });
  const sound = h('input', { type: 'checkbox', checked: settings.sound, on: { change: () => update({ sound: sound.checked }) } });
  const volume = h('input', { type: 'range', min: '0', max: '1', step: '0.1', value: String(settings.volume), 'aria-label': '音量', on: { change: () => update({ volume: Number(volume.value) }) } });
  const dialog = h(
    'dialog', { class: 'dialog effect-settings', 'aria-labelledby': 'settings-title' },
    h('h2', { id: 'settings-title' }, '設定'),
    progressTools(progress),
    h('p', {}, 'このブラウザの設定です。進捗ファイルには含まれません。変更はすぐに適用されます。'),
    h('fieldset', {}, h('legend', {}, '動き（アニメーション）'),
      ...([['system', 'OS の設定に従う'], ['on', 'オン'], ['off', 'オフ']] as const).map(([value, label]) =>
        radioOption({ name: 'effect-motion', value, checked: settings.motion === value, className: 'effect-option', autoFocus: value === 'system', onChange: () => update({ motion: value }) }, label))),
    h('fieldset', {}, h('legend', {}, '効果音'), h('label', { class: 'effect-option' }, sound, '効果音を鳴らす'), h('label', {}, '音量', volume)),
    warning,
    h('button', { type: 'button', class: 'button', on: { click: () => dialog.close() } }, '閉じる'),
  );
  dialog.addEventListener('close', bindReason(store, warning), { once: true });
  showDialog(dialog);
}
