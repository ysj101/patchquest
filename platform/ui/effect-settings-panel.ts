// 演出設定のモーダル。変更はすぐ適用し、保存できない理由も表示する。
// 効果音と音量は保存形式にあるが、音源が入る（Issue #66）までは操作を出さない。
import { bindReason } from './browser-effects';
import { radioOption, showDialog } from './components';
import { h } from './dom';
import type { EffectSettings, EffectSettingsStore } from './effect-settings';

/** 設定を編集する。閉じた後に入口へフォーカスを戻し、購読を解除する。 */
export function openEffectSettings(store: EffectSettingsStore): void {
  const settings = store.effectSettings();
  const warning = h('p', { role: 'status', class: 'note' });
  const update = (change: Partial<EffectSettings>) => store.update({ ...store.effectSettings(), ...change });
  const dialog = h(
    'dialog', { class: 'dialog effect-settings', 'aria-labelledby': 'effect-settings-title' },
    h('h2', { id: 'effect-settings-title' }, '演出の設定'),
    h('p', {}, 'このブラウザの設定です。進捗ファイルには含まれません。変更はすぐに適用されます。'),
    h('fieldset', {}, h('legend', {}, '動き（アニメーション）'),
      ...([['system', 'OS の設定に従う'], ['on', 'オン'], ['off', 'オフ']] as const).map(([value, label]) =>
        radioOption({ name: 'effect-motion', value, checked: settings.motion === value, className: 'effect-option', onChange: () => update({ motion: value }) }, label))),
    warning,
    h('button', { type: 'button', class: 'button', on: { click: () => dialog.close() } }, '閉じる'),
  );
  dialog.addEventListener('close', bindReason(store, warning), { once: true });
  showDialog(dialog);
}
