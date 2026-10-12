// 同梱するカタログ（配布物に入る教材）の整合。パックは対応する教材アプリの契約に合っていなければならず、
// 操作ガイドの案内先は学習UIに実在しなければならない
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../catalog';
import { GUIDE_ANCHORS } from '../../platform/contract';
import { compatibleApp, validateForApp } from '../../platform/orchestrator/orchestrator';

describe('同梱カタログ', () => {
  it.each(catalog.packs)('$manifest.id は契約の検証に合格する', (pack) => {
    const app = compatibleApp(catalog.apps, pack);
    expect(app, '対応する版の教材アプリ').toBeDefined();
    expect(validateForApp(pack, app!)).toEqual([]);
  });
});

describe('操作ガイドの案内先', () => {
  it('どの案内先も学習UIのどこかに置かれている', () => {
    const sources = readdirSync('platform/ui').map((name) => readFileSync(`platform/ui/${name}`, 'utf8')).join('\n');
    expect(GUIDE_ANCHORS.filter((anchor) => !sources.includes(`'data-anchor': '${anchor}'`))).toEqual([]);
  });
});
