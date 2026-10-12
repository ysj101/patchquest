import type { TestCase } from '../../platform/contract';

/** 描画を含まないテストだけを取り出す。Node の実行環境は画面を描画できないため（描画を含むテストは E2E で確かめる） */
export const requestOnly = (tests: TestCase[]): TestCase[] => tests.filter((t) => t.steps.every((s) => s.kind === 'request'));
