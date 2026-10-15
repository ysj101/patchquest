// ブラウザの保存領域と OS の設定を、演出設定とルート属性へつなぐ。
import { announce, renderGuard } from './dom';
import { EffectSettingsStore } from './effect-settings';

/** 保存・復旧の理由を要素に表示し続ける。理由がなければ隠す。戻り値で購読を解除する */
export function bindReason(store: EffectSettingsStore, element: HTMLElement): () => void {
  const show = () => {
    element.hidden = store.reason === null;
    announce(element, store.reason ?? '');
  };
  show();
  return store.onChange(show);
}

/** 端末の好みを読み、動きの有効状態を data-motion に適用する。アプリ起動時に一度呼ぶ。 */
export function browserEffects(root: HTMLElement, warning: HTMLElement): EffectSettingsStore {
  const store = new EffectSettingsStore(() => localStorage);
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const guard = renderGuard();
  const apply = () => {
    const { motion } = store.effectSettings();
    const enabled = motion === 'system' ? !media.matches : motion === 'on';
    if (guard.changed(String(enabled))) root.dataset.motion = enabled ? 'on' : 'off';
  };
  store.onChange(apply);
  media.addEventListener('change', apply);
  apply();
  bindReason(store, warning);
  return store;
}
