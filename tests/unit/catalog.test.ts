// 同梱するカタログ（配布物に入る教材）の整合。パックは対応する教材アプリの契約に合い、互いに独立していなければならず、
// 操作ガイドの案内先は学習UIに実在しなければならない
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../catalog';
import { GUIDE_ANCHORS } from '../../platform/contract';
import { compatibleApp, validateForApp } from '../../platform/orchestrator/orchestrator';
import { mergeImplementations } from '../../runtimes/browser/registry';

describe('同梱カタログ', () => {
  it.each(catalog.packs)('$manifest.id は契約の検証に合格する', (pack) => {
    const app = compatibleApp(catalog.apps, pack);
    expect(app, '対応する版の教材アプリ').toBeDefined();
    expect(validateForApp(pack, app!)).toEqual([]);
  });

  it('課題 ID・アプリ ID は重複せず、課題 ID は missions/ のディレクトリ名と一致する', () => {
    const packIds = catalog.packs.map((p) => p.manifest.id);
    const appIds = catalog.apps.map((a) => a.descriptor.id);
    expect(new Set(packIds).size).toBe(packIds.length);
    expect(new Set(appIds).size).toBe(appIds.length);
    expect(packIds.filter((id) => !existsSync(`missions/${id}/index.ts`))).toEqual([]);
  });

  it('教材アプリの実装 ID はアプリ ID で始まる（課題の実装と重ならない）', () => {
    const misnamed = catalog.apps.flatMap((a) => Object.keys(a.implementations).filter((id) => !id.startsWith(`${a.descriptor.id}/`)));
    expect(misnamed).toEqual([]);
  });
});

describe('実装の登録簿', () => {
  it('同じ実装 ID を重ねて登録するとエラーにする', () => {
    const entry = { hook: 'memo.read.authorize', run: () => undefined };
    expect(() => mergeImplementations([{ 'idor/a': entry }, { 'idor/a': entry }])).toThrow('実装 ID「idor/a」が重複して登録されています');
    expect(Object.keys(mergeImplementations([{ 'idor/a': entry }, { 'xss/a': entry }]))).toEqual(['idor/a', 'xss/a']);
  });
});

describe('操作ガイドの案内先', () => {
  it('どの案内先も学習UIのどこかに置かれている', () => {
    const sources = readdirSync('platform/ui').map((name) => readFileSync(`platform/ui/${name}`, 'utf8')).join('\n');
    expect(GUIDE_ANCHORS.filter((anchor) => !sources.includes(`'data-anchor': '${anchor}'`))).toEqual([]);
  });
});
