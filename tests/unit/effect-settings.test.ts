// 端末ごとの設定（演出とベータ版の課題の表示）の検証・保存失敗・購読を DOM なしで確かめる。
import { describe, expect, it } from 'vitest';
import { EffectSettingsStore, onShowBetaChange, readEffectSettings, type EffectSettings } from '../../platform/ui/effect-settings';

const defaults: EffectSettings = { motion: 'system', sound: false, volume: 0.5, showBeta: false };
const chosen = { motion: 'off', sound: true, volume: 0.8, showBeta: true } as const;

describe('演出設定', () => {
  it('未保存なら OS に従い、効果音はオフ、音量は半分にし、ベータ版の課題は表示しない', () => {
    expect(readEffectSettings(null)).toEqual({ settings: defaults, reason: null });
  });

  it.each(['system', 'on', 'off'])('動きの指定 %s と音量の両端を読み取る', (motion) => {
    for (const volume of [0, 1]) {
      const settings = { motion, sound: true, volume, showBeta: true };
      expect(readEffectSettings(JSON.stringify(settings))).toEqual({ settings, reason: null });
    }
  });

  it.each(['{', 'null', '[]', '{}', '{"motion":["on"],"sound":false,"volume":0.5}', '{"motion":"unknown","sound":false,"volume":0.5}',
    '{"motion":"on","sound":"true","volume":0.5}',
    '{"motion":"on","sound":true,"volume":-0.1}',
    '{"motion":"on","sound":true,"volume":1.1}',
    '{"motion":"on","sound":true,"volume":1e999}',
    '{"motion":"on","sound":true,"volume":0.5,"showBeta":"true"}'])('不正な保存値 %s は理由を付けて既定値に戻す', (raw) => {
    const result = readEffectSettings(raw);
    expect(result.settings).toEqual(defaults);
    expect(result.reason, '既定値に戻した理由').toBeTruthy();
  });

  it('ベータ版の表示の項目がない保存値（項目を足す前の保存）は、ほかの設定を残して、表示しないとして読む', () => {
    expect(readEffectSettings('{"motion":"off","sound":true,"volume":0.8}')).toEqual({ settings: { ...chosen, showBeta: false }, reason: null });
  });

  it('ベータ版の表示の切り替えは、表示が変わったときだけ伝え、演出だけの変更では伝えない', () => {
    const store = new EffectSettingsStore(() => ({ getItem: () => null, setItem: () => undefined }));
    let calls = 0;
    const unsubscribe = onShowBetaChange(store, () => { calls += 1; });
    store.update({ ...defaults, sound: true });
    expect(calls, '演出だけの変更').toBe(0);
    store.update({ ...defaults, showBeta: true });
    store.update({ ...defaults, showBeta: true, volume: 1 });
    expect(calls, '有効にした').toBe(1);
    store.update(defaults);
    expect(calls, '無効に戻した').toBe(2);
    unsubscribe();
    store.update(chosen);
    expect(calls, '解除後は伝えない').toBe(2);
  });

  it('変更を保存して購読者に伝え、購読を解除できる', () => {
    let saved: string | null = null;
    const store = new EffectSettingsStore(() => ({ getItem: () => saved, setItem: (_key, value) => { saved = value; } }));
    const changes: unknown[] = [];
    const unsubscribe = store.onChange(() => changes.push(store.effectSettings()));
    store.update(chosen);
    expect(store.reason).toBeNull();
    expect(changes).toEqual([chosen]);
    expect(new EffectSettingsStore(() => ({ getItem: () => saved, setItem: () => { throw new Error('書き込み禁止'); } })).effectSettings()).toEqual(chosen);
    unsubscribe();
    store.update(defaults);
    expect(changes, '解除後は通知しない').toHaveLength(1);
  });

  it('保存領域の取得・読み取りに失敗しても理由を伝えてメモリで使える', () => {
    const store = new EffectSettingsStore(() => { throw new Error('保存領域が無効'); });
    expect(store.effectSettings()).toEqual(defaults);
    expect(store.reason).toContain('保存領域が無効');
    store.update(chosen);
    expect(store.effectSettings()).toEqual(chosen);
    expect(store.reason).toContain('保存領域が無効');
  });

  it('書き込み失敗でも変更を通知し、不正な更新は例外にする', () => {
    const store = new EffectSettingsStore(() => ({ getItem: () => null, setItem: () => { throw new Error('容量不足'); } }));
    let notified = false;
    store.onChange(() => { notified = true; });
    store.update(chosen);
    expect(store.reason).toContain('容量不足');
    expect(store.effectSettings()).toEqual(chosen);
    expect(notified, '保存失敗時もメモリ上の変更を通知する').toBe(true);
    expect(() => store.update({ ...chosen, volume: NaN })).toThrow('設定');
  });

  it('読み取った値を外から変えても設定は変わらない', () => {
    const store = new EffectSettingsStore(() => ({ getItem: () => '{', setItem: () => { throw new Error('無効'); } }));
    expect(store.reason).toBeTruthy();
    const value = store.effectSettings();
    value.volume = 1;
    expect(store.effectSettings()).toEqual(defaults);
    store.update(chosen);
    expect(store.reason).toContain('無効');
  });

  it('読み取りが失敗しても継続でき、保存が復旧したら警告を解除する', () => {
    let unavailable = true;
    const saved = new Map<string, string>();
    const store = new EffectSettingsStore(() => ({
      getItem: (key) => {
        if (unavailable) throw new Error('読み取り禁止');
        return saved.get(key) ?? null;
      },
      setItem: (key, value) => { saved.set(key, value); },
    }));
    expect(store.reason).toContain('読み取り禁止');
    unavailable = false;
    store.update(chosen);
    expect(store.reason).toBeNull();
    expect([...saved.keys()]).toEqual(['patchquest.effect-settings.v1']);
    expect(readEffectSettings(saved.get('patchquest.effect-settings.v1') ?? null)).toEqual({ settings: chosen, reason: null });
  });

});
