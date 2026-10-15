// 同梱コードだけで短い効果音を合成する。ブラウザが再生を拒否した場合は音だけを諦める。
import type { EffectSettingsStore } from './effect-settings';
import { soundPlan, type ResultEffectKind } from './result-effect-model';

const DURATION = 0.3;

export class ResultSound {
  private context: AudioContext | undefined;

  constructor(private readonly store: EffectSettingsStore) {}

  async play(kind: ResultEffectKind): Promise<void> {
    const plan = soundPlan(kind, this.store.effectSettings());
    if (!plan) return;
    try {
      this.context ??= new AudioContext();
      const context = this.context;
      await context.resume();
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const start = context.currentTime;
      oscillator.frequency.setValueAtTime(plan.frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(plan.endFrequency, start + DURATION);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(plan.gain, start + 0.02);
      envelope.gain.linearRampToValueAtTime(0, start + DURATION);
      oscillator.connect(envelope);
      envelope.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(start);
      oscillator.stop(start + DURATION);
    } catch {
      // 自動再生制限や音声デバイスの不在は学習上のエラーにしない。
    }
  }
}
