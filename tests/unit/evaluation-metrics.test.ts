// 効果の検証の指標の集計（scripts/evaluation-metrics.mjs）を、固定の進捗 JSON で確かめる
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROGRESS_FORMAT, PROGRESS_SCHEMA_VERSION } from '../../platform/progress/schema';
import { STAGES } from '../../platform/progress/stages';
import {
  collectMetrics,
  formatMetrics,
  listProgressFiles,
  loadParticipants,
  parseProgressExport,
  PROGRESS_SCHEMA_VERSIONS,
  STAGES as SCRIPT_STAGES,
} from '../../scripts/evaluation-metrics.mjs';
import { makeAttempt } from '../support/attempt';
import type { AttemptRecord } from '../../platform/contract';

const DONE = { achieved: true, at: '2026-10-12T01:00:00Z' };
const ALL_MILESTONES = { briefedAt: '2026-10-12T00:01:00Z', firstRequestAt: '2026-10-12T00:02:00Z', firstDefenseAt: '2026-10-12T00:03:00Z' };

function exportOf(attempts: AttemptRecord[]): string {
  return JSON.stringify({ format: PROGRESS_FORMAT, schemaVersion: PROGRESS_SCHEMA_VERSION, exportedAt: '2026-10-16T00:00:00Z', attempts, profile: {} });
}

const completedIdor = (attemptId: string, seed: number) =>
  makeAttempt(attemptId, { missionId: 'idor', seed, state: 'Passed', milestones: ALL_MILESTONES, badges: { reproduction: DONE, defense: DONE, understanding: DONE }, answers: { q1: 'a' } });

describe('parseProgressExport', () => {
  it('製品の進捗形式と同じ版の範囲・ステージ定義を使う', () => {
    expect(PROGRESS_SCHEMA_VERSIONS.newest).toBe(PROGRESS_SCHEMA_VERSION);
    expect(SCRIPT_STAGES.map((stage) => stage.id)).toEqual(STAGES.map((stage) => stage.id));
  });

  it('集計に使う項目だけを取り出し、milestones のない旧版は未到達として読む', () => {
    const attempt = makeAttempt('a1', { badges: { reproduction: DONE, defense: { achieved: false }, understanding: { achieved: false } } });
    const legacy: Partial<AttemptRecord> = { ...attempt };
    delete legacy.milestones;
    const parsed = parseProgressExport(JSON.stringify({ format: PROGRESS_FORMAT, schemaVersion: 1, exportedAt: 'x', attempts: [legacy] }));
    expect(parsed.attempts).toEqual([
      { attemptId: 'a1', missionId: 'test-pack', variantId: 'default', seed: 42, createdAt: attempt.createdAt, milestones: { briefedAt: null, firstRequestAt: null, firstDefenseAt: null }, badges: { reproduction: true, defense: false, understanding: false }, answered: false },
    ]);
  });

  it.each([
    ['JSON でない', 'nope', 'JSON として読み込めません'],
    ['format が違う', JSON.stringify({ format: 'x', schemaVersion: 1, attempts: [] }), 'PatchQuest の進捗ファイルではありません'],
    ['版が新しすぎる', JSON.stringify({ format: PROGRESS_FORMAT, schemaVersion: PROGRESS_SCHEMA_VERSION + 1, attempts: [] }), '対応していない版'],
    ['attempts が配列でない', JSON.stringify({ format: PROGRESS_FORMAT, schemaVersion: 1, attempts: {} }), 'attempts: 配列が必要です'],
    ['達成印が真偽値でない', exportOf([{ ...makeAttempt('a1'), badges: { reproduction: { achieved: 'yes' } } } as unknown as AttemptRecord]), 'attempts[0].badges.reproduction.achieved'],
    ['missionId が空', exportOf([makeAttempt('a1', { missionId: '' })]), 'attempts[0].missionId'],
    ['大きすぎる', `{"format":"${PROGRESS_FORMAT}","pad":"${'x'.repeat(1024 * 1024)}"}`, '大きすぎます'],
  ])('壊れたファイルは理由を示して拒む：%s', (_name, text, message) => {
    expect(() => parseProgressExport(text)).toThrow(message);
  });
});

describe('collectMetrics', () => {
  const alice = parseProgressExport(exportOf([completedIdor('a1', 1), completedIdor('a2', 2), makeAttempt('a3', { missionId: 'sqli', milestones: { ...ALL_MILESTONES, firstDefenseAt: null }, badges: { reproduction: DONE, defense: { achieved: false }, understanding: { achieved: false } }, answers: {} })]));
  const bob = parseProgressExport(exportOf([makeAttempt('b1', { missionId: 'idor', milestones: { ...ALL_MILESTONES, firstRequestAt: null, firstDefenseAt: null } })]));
  const carol = parseProgressExport(exportOf([]));

  it('初回開始率は 1 件でも演習を始めた参加者の割合', () => {
    expect(collectMetrics([alice, bob, carol]).firstStart).toEqual({ numerator: 2, denominator: 3, rate: 2 / 3 });
  });

  const missionOf = (metrics: ReturnType<typeof collectMetrics>, missionId: string) => {
    const mission = metrics.missions.find((entry) => entry.missionId === missionId);
    if (!mission) throw new Error(`${missionId} の集計がありません`);
    return mission;
  };

  it('ステージ到達率は課題ごとに、始めた演習のうち到達した演習の割合', () => {
    const idor = missionOf(collectMetrics([alice, bob, carol]), 'idor');
    expect(idor.stages.briefed).toEqual({ numerator: 3, denominator: 3, rate: 1 });
    expect(idor.stages.investigated).toEqual({ numerator: 2, denominator: 3, rate: 2 / 3 });
    expect(idor.stages.verified).toEqual({ numerator: 2, denominator: 3, rate: 2 / 3 });
  });

  it('完了率は始めた参加者のうち達成印 3 つが揃った演習を持つ割合、再挑戦率は別 seed で 2 回以上の割合', () => {
    const metrics = collectMetrics([alice, bob, carol]);
    expect(missionOf(metrics, 'idor').completion).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(missionOf(metrics, 'idor').retry).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(missionOf(metrics, 'sqli').completion).toEqual({ numerator: 0, denominator: 1, rate: 0 });
    expect(missionOf(metrics, 'sqli').retry).toEqual({ numerator: 0, denominator: 1, rate: 0 });
  });

  it('同じ seed のやり直しは再挑戦に数えない', () => {
    const same = parseProgressExport(exportOf([completedIdor('a1', 7), completedIdor('a2', 7)]));
    expect(missionOf(collectMetrics([same]), 'idor').retry).toEqual({ numerator: 0, denominator: 1, rate: 0 });
  });

  it('理解確認の正答率は回答した演習のうち理解の達成印が付いた割合で、回答がなければ分母 0', () => {
    const metrics = collectMetrics([alice, bob, carol]);
    expect(missionOf(metrics, 'idor').transferCheck).toEqual({ numerator: 2, denominator: 2, rate: 1 });
    expect(missionOf(metrics, 'sqli').transferCheck).toEqual({ numerator: 0, denominator: 0, rate: null });
  });

  it('missionIds を指定すると、その課題だけを集計し、他の課題の演習は開始にも数えない', () => {
    const metrics = collectMetrics([alice, bob, carol], { missionIds: ['sqli'] });
    expect(metrics.missions.map((mission) => mission.missionId)).toEqual(['sqli']);
    expect(metrics.firstStart).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
  });

  it('表には人数・各指標の割合と分子分母・分母 0 の印が入る', () => {
    const text = formatMetrics(collectMetrics([alice, bob, carol]));
    expect(text).toContain('参加者 3 人');
    expect(text).toContain('初回開始率: 67%（2/3）');
    expect(text).toContain('## idor');
    expect(text).toContain('ステージ到達率（手がかりを探す）: 67%（2/3）');
    expect(text).toContain('理解確認の正答率（回答した演習のうち理解の達成印）: —（分母 0）');
  });
});

describe('loadParticipants', () => {
  it('ディレクトリ配下の .json を名前順に読み、壊れたファイルは理由つきで飛ばす', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pq-metrics-'));
    writeFileSync(join(dir, 'b.json'), exportOf([completedIdor('b1', 1)]));
    writeFileSync(join(dir, 'a.json'), 'nope');
    writeFileSync(join(dir, 'note.txt'), 'ignored');
    const files = await listProgressFiles([dir]);
    expect(files).toEqual([join(dir, 'a.json'), join(dir, 'b.json')]);
    const { participants, skipped } = await loadParticipants(files);
    expect(participants.map((participant) => participant.file)).toEqual([join(dir, 'b.json')]);
    expect(skipped).toEqual([{ file: join(dir, 'a.json'), reason: 'ファイル: JSON として読み込めません' }]);
  });
});
