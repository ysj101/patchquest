// 正規表現エンジン PCRE2（WASM）と、実行エンジンでの持ち方（Issue #238）。
// 処理の上限（match limit）に達した照合が、経過時間ではなく PCRE2 のエラーコードで分かることを確かめる
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { memoApp } from '../../apps/memo';
import { RuntimeError, type PrepareOptions } from '../../platform/contract';
import { AppEngine } from '../../runtimes/browser/engine';
import { REGEX_ASSET, RegexEngine } from '../../runtimes/browser/regex';
import { readMachineAsset } from '../support/machine-assets';

const NESTED = '^([a-z0-9]+[._-]?)*[a-z0-9]$';
const LINEAR = '^[a-z0-9]+([._-][a-z0-9]+)*$';
const LIMIT = 1_000_000;
const attack = (count: number) => `${'a'.repeat(count)}!`;

const load = async (matchLimit = LIMIT) => RegexEngine.load(await readMachineAsset(REGEX_ASSET), matchLimit);

describe('配布物 pcre2.wasm', () => {
  it('外の関数（import）を 1 つも要らない。通信や保存の手段を渡さずに動く', async () => {
    const module = await WebAssembly.compile(await readFile('vendor/pcre2/pcre2.wasm'));
    expect(WebAssembly.Module.imports(module)).toEqual([]);
  });

  it('PCRE2 の版を答える', async () => {
    expect((await load()).version).toMatch(/^10\.\d+ \d{4}-\d{2}-\d{2}$/);
  });
});

describe('照合', () => {
  it('一致・不一致を答え、パターンの項目を試した回数を数える', async () => {
    const regex = await load();
    expect(regex.match(LINEAR, 'taro.yamada')).toEqual({ outcome: 'match', steps: 9 });
    expect(regex.match(LINEAR, 'taro..yamada').outcome).toBe('no-match');
    expect(regex.match(LINEAR, '').outcome).toBe('no-match');
    expect(regex.match('^山田[0-9]+$', '山田42').outcome).toBe('match');
  });

  it('入れ子のくり返しでは、一致しない入力が 1 文字増えるたびに、試した回数が 2 倍になる', async () => {
    const regex = await load();
    const steps = [4, 5, 6, 8, 12, 16].map((count) => regex.match(NESTED, attack(count)));
    expect(steps.map((result) => result.outcome)).toEqual(Array.from({ length: 6 }, () => 'no-match'));
    expect(steps.map((result) => result.steps)).toEqual([72, 144, 288, 1152, 18_432, 294_912]);
  });

  it('入れ子をやめた正規表現では、試した回数は文字数に比例する', async () => {
    const regex = await load();
    expect([4, 8, 12, 16, 19].map((count) => regex.match(LINEAR, attack(count)).steps)).toEqual([14, 26, 38, 50, 59]);
  });

  it('処理の上限（match limit）に達すると、結論を出さずに打ち切る。上限を広げれば、同じ入力でも最後まで終わる', async () => {
    expect((await load()).match(NESTED, attack(19)).outcome).toBe('limit');
    expect((await load()).match(NESTED, attack(18)).outcome).toBe('limit');
    expect((await load()).match(NESTED, attack(17)).outcome).toBe('no-match');
    expect((await load(1000)).match(NESTED, attack(10)).outcome).toBe('limit');
    expect((await load(10_000_000)).match(NESTED, attack(19)).outcome).toBe('no-match');
  });

  it('打ち切ったあとも、同じエンジンで次の照合ができる', async () => {
    const regex = await load();
    for (let i = 0; i < 3; i++) expect(regex.match(NESTED, attack(19)).outcome).toBe('limit');
    expect(regex.match(NESTED, 'taro.yamada').outcome).toBe('match');
  });

  it('正しくない正規表現は、場所と PCRE2 の説明を付けて断る', async () => {
    const regex = await load();
    expect(() => regex.match('^(a', 'a')).toThrow('正規表現が正しくありません（3 文字目）：missing closing parenthesis');
  });

  it('照合の途中のエラー（後戻りの深さの上限など）は、不一致として扱わずに断る', async () => {
    const regex = await load();
    expect(() => regex.match('(*LIMIT_DEPTH=1)^(a+)+$', 'aaa!')).toThrow('正規表現の照合に失敗しました：matching depth limit exceeded');
  });

  it('処理の上限は 1 以上の整数で指定する', async () => {
    await expect(load(0)).rejects.toThrow('正規表現の処理の上限が正しくありません');
    await expect(load(1.5)).rejects.toBeInstanceOf(RuntimeError);
  });
});

describe('実行エンジンでの持ち方', () => {
  const options: PrepareOptions = { attemptId: 'a1', app: { id: memoApp.descriptor.id, version: memoApp.descriptor.version }, fixture: { generator: 'memo.default', seed: 1 }, implementations: {} };

  it('配布物を読む手段がない実行環境では、正規表現エンジンを使うアプリを準備できない', async () => {
    await expect(new AppEngine().prepare(options)).rejects.toThrow('この実行環境は、正規表現エンジンを動かせません');
  });

  it('配布物を読むのは最初の 1 回だけで、初期状態へ戻しても読み直さない（通信を塞いだあとでも作り直せる）', async () => {
    const requested: string[] = [];
    const engine = new AppEngine((name) => {
      requested.push(name);
      return readMachineAsset(name);
    });
    await engine.prepare(options);
    await engine.reset();
    await engine.prepare(options);
    expect(requested).toEqual([REGEX_ASSET]);
    await engine.dispose();
  });

  it('配布物を読めなかったら準備に失敗し、次の準備で読み直す', async () => {
    let attempts = 0;
    const engine = new AppEngine((name) => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error('読めません')) : readMachineAsset(name);
    });
    await expect(engine.prepare(options)).rejects.toThrow('読めません');
    await engine.prepare(options);
    expect(attempts).toBe(2);
    await engine.dispose();
  });
});
