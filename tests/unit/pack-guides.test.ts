// 常に表示する説明（調べ方・操作のしかた）に、答えが書かれていないこと。全パック共通で、検証データの answerTerms で確かめる
import { describe, expect, it } from 'vitest';
import { answerTerms, catalog } from '../support/catalog';
import { guideAnswerProblems } from '../support/verification-data';
import { samplePack } from '../support/sample-pack';

describe('調べ方・操作のしかたに答えを書かない', () => {
  it.each(catalog.packs)('$manifest.id の調べ方・操作のしかたには、答えを示す語がない', (pack) => {
    expect(guideAnswerProblems(pack.manifest, answerTerms(pack.manifest.id))).toEqual([]);
  });

  it('調べ方も操作のしかたも持たないパックは、答えを示す語がなくても問題にしない', () => {
    expect(guideAnswerProblems(samplePack().manifest, undefined)).toEqual([]);
  });

  it('調べ方を持つのに答えを示す語がなければ、理由付きで止める', () => {
    const { manifest } = samplePack();
    manifest.approach = { intro: '前提の仕組み', steps: ['手順'] };
    expect(guideAnswerProblems(manifest, undefined)).toEqual([expect.stringContaining('answerTerms（答えを示す語）が必要です')]);
    expect(guideAnswerProblems(manifest, [])).toEqual([expect.stringContaining('answerTerms（答えを示す語）が必要です')]);
  });

  it('調べ方・操作のしかたに答えを示す語があれば、場所と語を示して止める', () => {
    const { manifest } = samplePack();
    manifest.solution = '所有者を照合する';
    manifest.approach = { intro: '前提の仕組み', steps: ['手順', '所有者を照合して直す'] };
    manifest.repairGuide = { intro: '所有者を照合する道具', steps: ['保存する'] };
    expect(guideAnswerProblems(manifest, ['照合'])).toEqual([
      'approach.steps[1] に答えを示す語「照合」があります',
      'repairGuide.intro に答えを示す語「照合」があります',
    ]);
  });

  it('ヒント 3 にも solution にも出てこない語は、答えを示す語として認めない', () => {
    const { manifest } = samplePack();
    manifest.approach = { intro: '前提の仕組み', steps: ['手順'] };
    expect(guideAnswerProblems(manifest, ['関係のない語'])).toEqual(['answerTerms の「関係のない語」は、ヒント 3 にも solution にも出てきません']);
  });
});
