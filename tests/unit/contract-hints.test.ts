// ヒントと解法の契約：書ける文字数の上限と、`…` で囲むコードの書き誤り
import { describe, expect, it } from 'vitest';
import { HINT_LIMITS, validatePack, type MissionManifest } from '../../platform/contract';
import { samplePack, sampleApp } from '../support/sample-pack';

/** 見本のパックの manifest を書き換えて検証し、問題の一覧を返す */
function problems(change: (manifest: MissionManifest) => void): string[] {
  const pack = samplePack();
  change(pack.manifest);
  return validatePack(pack, { app: sampleApp });
}

/** 段階を指定してヒントの文を書き換える */
function setHint(manifest: MissionManifest, level: number, text: string): void {
  const hint = manifest.hints.find((entry) => entry.level === level);
  if (!hint) throw new Error(`ヒント ${level} がありません`);
  hint.text = text;
}

describe('ヒントと解法の契約', () => {
  it('上限ちょうどの長さで、コードを `…` で囲んだヒントと解法は受け付ける', () => {
    const code = '`sudo -l`';
    expect(
      problems((manifest) => {
        setHint(manifest, 2, code + 'あ'.repeat(HINT_LIMITS.hint - code.length));
        manifest.solution = code + 'あ'.repeat(HINT_LIMITS.solution - code.length);
      }),
    ).toEqual([]);
  });

  it('ヒントが上限より長ければ、上限といまの文字数を示して拒否する', () => {
    expect(problems((manifest) => setHint(manifest, 1, 'あ'.repeat(HINT_LIMITS.hint + 1)))).toEqual([expect.stringMatching(/^hints\[0\]\.text: 120 文字以内で書いてください（いまは 121 文字）/)]);
  });

  it('解法が上限より長ければ、上限といまの文字数を示して拒否する', () => {
    expect(problems((manifest) => (manifest.solution = 'あ'.repeat(HINT_LIMITS.solution + 1)))).toEqual([expect.stringMatching(/^solution: 160 文字以内で書いてください（いまは 161 文字）/)]);
  });

  it.each([
    ['閉じていない', '`sudo -l を打つ'],
    ['中身が空', '`` を打つ'],
  ])('コードの囲みが%sヒントと解法は拒否する', (_name, text) => {
    expect(problems((manifest) => setHint(manifest, 3, text))).toEqual([expect.stringMatching(/^hints\[2\]\.text: コードは/)]);
    expect(problems((manifest) => (manifest.solution = text))).toEqual([expect.stringMatching(/^solution: コードは/)]);
  });
});
