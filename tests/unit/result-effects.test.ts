// 評価結果からの通知文と、同梱する音の設定を確かめる。
import { describe, expect, it } from 'vitest';
import type { ResultGroup, TestOutcome, VerificationReport } from '../../platform/contract';
import { verificationEffect, soundPlan } from '../../platform/ui/result-effect-model';

const outcome = (group: ResultGroup, extra: Partial<TestOutcome> = {}): TestOutcome => ({ testId: group, title: '所有者以外の取得', group, passed: false, expected: '拒否', actual: '取得できた', ...extra });
const report = (outcomes: TestOutcome[], passed = false): VerificationReport => ({ runId: '実行', attemptId: '演習', configHash: '構成', outcomes, passed, startedAt: '開始', elapsedMs: 1 });

describe('結果の通知', () => {
  it('合格だけが防御成功になり、報告がなければ演出しない', () => {
    expect(verificationEffect(report([], true), false)).toEqual({ kind: 'secured', detail: '「防御」達成です。攻撃を止められて、ふだんの使い方もそのままできます。' });
    expect(verificationEffect(report([], true), true)).toEqual({ kind: 'secured', detail: '再現・防御・理解がぜんぶそろいました。攻撃を止められて、ふだんの使い方もそのままできます。' });
    expect(verificationEffect(null, false)).toBeNull();
  });
  it.each([
    ['attack', '攻撃をまだ防げていません'], ['normal', 'ふだんの使い方が壊れています'], ['regression', 'ほかの守りが壊れています'],
  ] as const)('%s の失敗に題名と期待・実測を添える', (group, reason) => {
    const failures = [{ reason, title: '所有者以外の取得', expected: '拒否', actual: '取得できた' }];
    expect(verificationEffect(report([outcome(group)]), false)).toEqual({ kind: 'insufficient', detail: `${reason}：所有者以外の取得（正しい結果「拒否」、実際の結果「取得できた」）`, failures, more: 0 });
  });
  it('複数の失敗は先頭二件まで表示し、合格は含めない', () => {
    const result = verificationEffect(report([outcome('normal', { passed: true }), outcome('attack'), outcome('normal'), outcome('regression')]), false);
    expect(result?.detail).toBe('攻撃をまだ防げていません：所有者以外の取得（正しい結果「拒否」、実際の結果「取得できた」）。ふだんの使い方が壊れています：所有者以外の取得（正しい結果「拒否」、実際の結果「取得できた」）。ほか 1 件');
    // 画面には、失敗を 1 件ずつ分けて示す
    expect(result?.failures?.map((failure) => failure.reason)).toEqual(['攻撃をまだ防げていません', 'ふだんの使い方が壊れています']);
    expect(result?.more).toBe(1);
  });
  it('失敗に実行環境エラーが混ざれば演出を返さない', () => {
    expect(verificationEffect(report([outcome('attack'), outcome('normal', { error: '時間切れ' })]), false)).toBeNull();
  });
});

it('三種類の音を区別し、設定した音量を反映し、オフなら音を作らない', () => {
  const settings = { motion: 'system' as const, sound: true, volume: 0.4 };
  const plans = (['reproduced', 'secured', 'insufficient'] as const).map((kind) => soundPlan(kind, settings));
  expect(plans).toEqual([
    { frequency: 330, endFrequency: 165, gain: 0.08 },
    { frequency: 523, endFrequency: 1046, gain: 0.08 },
    { frequency: 220, endFrequency: 196, gain: 0.08 },
  ]);
  expect(soundPlan('secured', { ...settings, sound: false })).toBeNull();
  expect(soundPlan('secured', { ...settings, volume: 0 })?.gain).toBe(0);
});
