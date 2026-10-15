// 演出（動き・効果音）の設定。端末ごとの好みとしてブラウザに保存し、進捗ファイルには含めない（spec §10, §13）
import { openModal, radioOption } from './components';
import { h } from './dom';

/** いま有効な演出。音量は 0（無音）から 1（最大） */
export interface EffectSettings {
  /** アニメーションを動かすか。未保存のときは OS の prefers-reduced-motion に従う */
  motion: boolean;
  /** 効果音を鳴らすか。初期値はオフ */
  sound: boolean;
  /** 効果音の音量（0 から 1） */
  volume: number;
}

/** ブラウザに保存する形。motion を省いたときは OS の設定に従う */
interface StoredEffects {
  motion?: boolean;
  sound: boolean;
  volume: number;
}

const STORAGE_KEY = 'patchquest.effects';
const MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const DEFAULT_VOLUME = 1;

/** 保存できないあいだだけ使う。null ならブラウザの保存領域を読む */
let memory: StoredEffects | null = null;
let watchingMotion = false;

function defaults(): StoredEffects {
  return { sound: false, volume: DEFAULT_VOLUME };
}

function reducedMotion(): boolean {
  return window.matchMedia(MOTION_QUERY).matches;
}

function browserStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function volumeOf(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}

/** 未設定は undefined、真偽値はそのまま、それ以外は壊れているので null */
function motionOf(value: unknown): boolean | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  return null;
}

/** 壊れた保存値は null。呼び出し側が捨てて初期値に戻す */
function parseStored(raw: string): StoredEffects | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data)) return null;
    const volume = volumeOf(data.volume);
    const motion = motionOf(data.motion);
    if (typeof data.sound !== 'boolean' || volume === null || motion === null) return null;
    return { ...(motion === undefined ? {} : { motion }), sound: data.sound, volume };
  } catch {
    return null;
  }
}

function readStored(): StoredEffects {
  if (memory) return { ...memory };
  const store = browserStorage();
  if (!store) return defaults();
  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return defaults();
  }
  if (raw === null) return defaults();
  const parsed = parseStored(raw);
  if (parsed) return parsed;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // 捨てられなくても初期値で続ける。次に保存できれば上書きされる
  }
  return defaults();
}

/** 保存できたら true。できないときはメモリに残して false */
function writeStored(next: StoredEffects): boolean {
  const store = browserStorage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(next));
      memory = null;
      return true;
    } catch {
      // 保存できないので、このページを開いているあいだはメモリで続ける
    }
  }
  memory = next;
  return false;
}

function storageWritable(): boolean {
  if (memory) return false;
  const store = browserStorage();
  if (!store) return false;
  const probe = `${STORAGE_KEY}.probe`;
  try {
    store.setItem(probe, '1');
    store.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * いま有効な演出の設定。動きをまだ選んでいなければ、OS の prefers-reduced-motion に従う。
 * 効果音の初期値はオフ。#66 が効果音を鳴らすときに参照する。
 */
export function effectSettings(): EffectSettings {
  const stored = readStored();
  return { motion: stored.motion ?? !reducedMotion(), sound: stored.sound, volume: stored.volume };
}

function applyMotion(): void {
  document.documentElement.dataset.motion = effectSettings().motion ? 'on' : 'off';
}

/** 保存した設定を文書のルートへ反映し、動きをまだ選んでいないときは OS の変更も追う */
export function installEffectSettings(): void {
  applyMotion();
  if (watchingMotion) return;
  watchingMotion = true;
  window.matchMedia(MOTION_QUERY).addEventListener('change', () => applyMotion());
}

function commit(patch: Partial<StoredEffects>): boolean {
  const saved = writeStored({ ...readStored(), ...patch });
  applyMotion();
  return saved;
}

function percent(volume: number): string {
  return `${Math.round(volume * 100)}%`;
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) throw new Error(`音量が数値ではありません: ${String(value)}`);
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

function onOff(name: string, enabled: boolean, choose: (value: boolean) => void): HTMLDivElement {
  return h(
    'div',
    { class: 'effect-options' },
    radioOption({ name, value: 'on', checked: enabled, className: 'effect-option', onChange: () => choose(true) }, 'オン'),
    radioOption({ name, value: 'off', checked: !enabled, className: 'effect-option', onChange: () => choose(false) }, 'オフ'),
  );
}

function settingGroup(legend: string, note: string, choices: HTMLElement): HTMLFieldSetElement {
  return h('fieldset', {}, h('legend', {}, legend), choices, h('p', { class: 'note' }, note));
}

function onVolume(input: HTMLInputElement, output: HTMLElement, publish: (volume: number) => void): void {
  const volume = clampVolume(Number(input.value));
  const text = percent(volume);
  output.textContent = text;
  input.setAttribute('aria-valuetext', text);
  publish(volume);
}

function volumeControl(current: number, publish: (volume: number) => void): HTMLDivElement {
  const output = h('span', { id: 'effect-volume-value' }, percent(current));
  const input = h('input', {
    type: 'range',
    id: 'effect-volume',
    min: '0',
    max: '1',
    step: '0.05',
    value: String(current),
    'aria-describedby': 'effect-volume-value',
    'aria-valuetext': percent(current),
    on: { input: () => onVolume(input, output, publish) },
  });
  return h(
    'div',
    { class: 'field' },
    h('label', { for: 'effect-volume' }, '音量'),
    h('p', { class: 'note' }, '効果音をオンにしたときの大きさです。'),
    h('div', { class: 'effect-volume' }, input, output),
  );
}

function storageNote(): HTMLParagraphElement {
  return h(
    'p',
    { class: 'banner banner-warn', role: 'status', hidden: storageWritable() },
    'ブラウザに保存できません。設定はページを読み直すと初期値に戻ります。',
  );
}

function openEffectSettings(): void {
  if (document.querySelector('dialog.effect-settings')) return;
  const current = effectSettings();
  const note = storageNote();
  const saved = (ok: boolean) => {
    note.hidden = ok;
  };
  const dialog = h(
    'dialog',
    { class: 'dialog effect-settings', 'aria-labelledby': 'effect-settings-title' },
    h('h2', { id: 'effect-settings-title' }, '演出の設定'),
    h('p', {}, 'アニメーションと効果音を切り替えます。オフにしても、課題は最後まで進められます。'),
    settingGroup(
      '動き',
      'オフにするとアニメーションを止めます。まだ選んでいないときは、端末の「動きを減らす」設定に従います。',
      onOff('effect-motion', current.motion, (motion) => saved(commit({ motion }))),
    ),
    settingGroup('効果音', '最初はオフです。', onOff('effect-sound', current.sound, (sound) => saved(commit({ sound })))),
    volumeControl(current.volume, (volume) => saved(commit({ volume }))),
    note,
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'button button-primary', on: { click: () => dialog.close() } }, '閉じる')),
  );
  void openModal(dialog);
}

/** 演出の設定を開くボタン。課題一覧のヘッダーと演習画面のヘッダーから使う */
export function effectSettingsButton(className = 'button'): HTMLButtonElement {
  return h('button', { type: 'button', class: className, 'aria-haspopup': 'dialog', on: { click: () => openEffectSettings() } }, '演出の設定');
}
