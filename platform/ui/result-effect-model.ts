// 実際の評価結果から通知内容と合成音のパラメーターを決める。DOM に依存しない。
import type { VerificationReport } from '../contract';
import type { EffectSettings } from './effect-settings';
import { VERDICT_REASON, VERDICT_SUCCESS } from './labels';

export type ResultEffectKind = 'reproduced' | 'secured' | 'insufficient';
export interface ResultEffect { kind: ResultEffectKind; detail: string }

/** エラーを含む失敗は演出しない。通常の失敗はパックの文言を二件まで使う。 */
export function verificationEffect(report: VerificationReport | null, allSealsDone: boolean): ResultEffect | null {
  if (!report) return null;
  if (report.passed) {
    const sealMessage = allSealsDone ? 'すべての検印がそろいました。' : '防御の検印を押しました。';
    return { kind: 'secured', detail: sealMessage + VERDICT_SUCCESS };
  }
  const failed = report.outcomes.filter((outcome) => !outcome.passed);
  if (failed.some((outcome) => outcome.error !== undefined)) return null;
  const details = failed.slice(0, 2).map((outcome) => `${VERDICT_REASON[outcome.group]}：${outcome.title}（期待「${outcome.expected}」、実測「${outcome.actual}」）`);
  if (failed.length > 2) details.push(`ほか ${failed.length - 2} 件`);
  return { kind: 'insufficient', detail: details.join('。') };
}

/** 音の種類と音量を設定から決める。最大振幅を抑えた短い音のみを合成する。 */
export function soundPlan(kind: ResultEffectKind, settings: EffectSettings): { frequency: number; endFrequency: number; gain: number } | null {
  if (!settings.sound) return null;
  const tones = { reproduced: [330, 165], secured: [523, 1046], insufficient: [220, 196] } as const;
  const [frequency, endFrequency] = tones[kind];
  return { frequency, endFrequency, gain: settings.volume / 5 };
}
