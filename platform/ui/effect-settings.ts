// 端末ごとの演出設定を検証・保存する。DOM とブラウザのグローバルには依存しない。
import { Checker } from '../contract';

/** 保存する好み。system は OS の動きの設定に従う。音量は 0〜1。 */
export interface EffectSettings {
  motion: 'system' | 'on' | 'off';
  sound: boolean;
  volume: number;
}

const MOTIONS = ['system', 'on', 'off'] as const;
const DEFAULTS: EffectSettings = { motion: 'system', sound: false, volume: 0.5 };
const STORAGE_KEY = 'patchquest.effect-settings.v1';
type SettingsStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** 値を検査して設定に整える。違反は Checker の errors に path 付きで集まる */
function checkSettings(check: Checker, value: unknown): EffectSettings {
  const raw = check.obj('演出設定', value);
  const volume = check.num('volume', raw.volume);
  if (volume < 0 || volume > 1) check.fail('volume', '0 以上 1 以下が必要です');
  return { motion: check.oneOf('motion', raw.motion, MOTIONS), sound: check.bool('sound', raw.sound), volume };
}

/** 未保存なら既定値、不正な保存文字列なら既定値と復旧理由を返す。 */
export function readEffectSettings(raw: string | null): { settings: EffectSettings; reason: string | null } {
  if (raw === null) return { settings: { ...DEFAULTS }, reason: null };
  const check = new Checker();
  let settings = DEFAULTS;
  try {
    const value: unknown = JSON.parse(raw);
    settings = checkSettings(check, value);
  } catch (error) {
    check.fail('演出設定', `JSON として読み込めません（${describe(error)}）`);
  }
  if (check.errors.length > 0) return { settings: { ...DEFAULTS }, reason: `演出設定を既定値に戻しました：${check.errors.join('、')}` };
  return { settings, reason: null };
}

/** 演出設定の読み取り・購読・保存。保存不可でも変更をメモリに保ち、reason で通知する。 */
export class EffectSettingsStore {
  private settings: EffectSettings = { ...DEFAULTS };
  private readonly listeners = new Set<() => void>();
  private warning: string | null = null;

  constructor(private readonly storage: () => SettingsStorage) {
    try {
      const result = readEffectSettings(storage().getItem(STORAGE_KEY));
      this.settings = result.settings;
      this.warning = result.reason;
    } catch (error) {
      this.warning = this.storageFailure(error);
    }
  }

  /** 保存・復旧に関する理由。null は問題が報告されていない状態。 */
  get reason(): string | null { return this.warning; }

  /** 現在の好みのコピー。動きの system は利用側で OS 設定と合わせて解決する。 */
  effectSettings(): EffectSettings { return { ...this.settings }; }

  /** 変更を購読する。戻り値を呼ぶと購読を解除する。保存失敗時も通知する。 */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** 設定を直ちに適用し保存する。不正な入力は例外、保存失敗は reason で知らせる。 */
  update(settings: EffectSettings): void {
    const check = new Checker();
    const checked = checkSettings(check, settings);
    if (check.errors.length > 0) throw new Error(`演出設定の値が不正です：${check.errors.join('、')}`);
    this.settings = checked;
    try {
      // Storage は書き込めないとき（容量超過・無効）に例外を投げるので、読み戻しはしない
      this.storage().setItem(STORAGE_KEY, JSON.stringify(checked));
      this.warning = null;
    } catch (error) {
      this.warning = this.storageFailure(error);
    }
    this.listeners.forEach((listener) => listener());
  }

  private storageFailure(error: unknown): string {
    return `演出設定をブラウザに保存できません。この画面を閉じると変更は失われます：${describe(error)}`;
  }
}
