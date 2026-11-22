// 実際の評価結果から通知内容と合成音のパラメーターを決める。DOM に依存しない。
import { failedOutcomes, type VerificationReport } from '../contract';
import type { EffectSettings } from './effect-settings';
import { VERDICT_REASON, VERDICT_SUCCESS } from './labels';

export type ResultEffectKind = 'reproduced' | 'secured' | 'insufficient';
/** 不合格のときに示す、失敗したテスト 1 件 */
export interface FailureDetail { reason: string; title: string; expected: string; actual: string }
export interface ResultEffect {
  kind: ResultEffectKind;
  /** 読み上げに使う 1 文。画面でも、failures がなければこれを示す */
  detail: string;
  /** 不合格のとき、画面に 1 件ずつ分けて示す失敗（先頭二件まで） */
  failures?: FailureDetail[];
  /** failures に入れなかった失敗の件数 */
  more?: number;
}

/** エラーを含む失敗は演出しない。通常の失敗はパックの文言を二件まで使う。 */
export function verificationEffect(report: VerificationReport | null, allSealsDone: boolean): ResultEffect | null {
  if (!report) return null;
  if (report.passed) {
    const sealMessage = allSealsDone ? '再現・防御・理解がぜんぶそろいました。' : '「防御」達成です。';
    return { kind: 'secured', detail: sealMessage + VERDICT_SUCCESS };
  }
  const failed = failedOutcomes(report);
  if (failed.some((outcome) => outcome.error !== undefined)) return null;
  const failures = failed.slice(0, 2).map((outcome) => ({ reason: VERDICT_REASON[outcome.group], title: outcome.title, expected: outcome.expected, actual: outcome.actual }));
  const more = failed.length - failures.length;
  const details = failures.map((failure) => `${failure.reason}：${failure.title}（正しい結果「${failure.expected}」、実際の結果「${failure.actual}」）`);
  if (more > 0) details.push(`ほか ${more} 件`);
  return { kind: 'insufficient', detail: details.join('。'), failures, more };
}

/** 音の種類と音量を設定から決める。最大振幅を抑えた短い音のみを合成する。 */
export function soundPlan(kind: ResultEffectKind, settings: EffectSettings): { frequency: number; endFrequency: number; gain: number } | null {
  if (!settings.sound) return null;
  const tones = { reproduced: [330, 165], secured: [523, 1046], insufficient: [220, 196] } as const;
  const [frequency, endFrequency] = tones[kind];
  return { frequency, endFrequency, gain: settings.volume / 5 };
}
