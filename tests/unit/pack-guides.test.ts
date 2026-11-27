// 調べ方・操作のしかたのカード（出していないカードも含む）に、答えが書かれていないことと、理解確認の問数。全パック共通で確かめる（答えは検証データの answerTerms で確かめる）
import { describe, expect, it } from 'vitest';
import { catalog as bundled } from '../../catalog';
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
    manifest.approach = { cards: [{ title: '見出し', observe: '見るところ' }] };
    expect(guideAnswerProblems(manifest, undefined)).toEqual([expect.stringContaining('answerTerms（答えを示す語）が必要です')]);
    expect(guideAnswerProblems(manifest, [])).toEqual([expect.stringContaining('answerTerms（答えを示す語）が必要です')]);
  });

  it('調べ方・操作のしかたに答えを示す語があれば、場所と語を示して止める', () => {
    const { manifest } = samplePack();
    manifest.solution = '所有者を照合する';
    manifest.approach = { cards: [{ title: '見出し', observe: '見るところ' }, { title: '所有者を照合する', commands: ['ls', '照合 --all'], observe: '所有者を照合して直す', note: '照合の意味' }] };
    manifest.repairGuide = { cards: [{ title: '保存する', observe: '所有者を照合する道具' }] };
    expect(guideAnswerProblems(manifest, ['照合'])).toEqual([
      'approach.cards[1].title に答えを示す語「照合」があります',
      'approach.cards[1].commands[1] に答えを示す語「照合」があります',
      'approach.cards[1].observe に答えを示す語「照合」があります',
      'approach.cards[1].note に答えを示す語「照合」があります',
      'repairGuide.cards[0].observe に答えを示す語「照合」があります',
    ]);
  });

  it('ヒント 3 にも solution にも出てこない語は、答えを示す語として認めない', () => {
    const { manifest } = samplePack();
    manifest.approach = { cards: [{ title: '見出し', observe: '見るところ' }] };
    expect(guideAnswerProblems(manifest, ['関係のない語'])).toEqual(['answerTerms の「関係のない語」は、ヒント 3 にも solution にも出てきません']);
  });
});

describe('理解確認の問数', () => {
  // 同梱するパックだけを見る（テスト専用のパックは 1 問でよい）
  it.each(bundled.packs.filter((pack) => pack.manifest.kind === 'mission'))('$manifest.id の理解確認は 2 問', (pack) => {
    expect(pack.manifest.transferCheck).toHaveLength(2);
  });
});
