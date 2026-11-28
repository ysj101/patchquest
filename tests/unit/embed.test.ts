// 教材アプリの画面が埋め込むページ（AppModule.embeds）を指す、URL の # 以降の組み立てと読み取り
import { describe, expect, it } from 'vitest';
import { embedHash, parseEmbed } from '../../runtimes/browser/embed';

describe('埋め込みページの指定', () => {
  it('組み立てた # 以降を読むと、同じ指定に戻る', () => {
    const target = { appId: 'memo', name: 'stamp-picker', param: 'auto' };
    expect(embedHash(target)).toBe('#memo/stamp-picker/auto');
    expect(parseEmbed(embedHash(target))).toEqual(target);
  });

  it('渡す文字列が空でも、区切りや日本語を含んでいても、そのまま戻る', () => {
    expect(parseEmbed(embedHash({ appId: 'memo', name: 'ad', param: '' }))).toEqual({ appId: 'memo', name: 'ad', param: '' });
    expect(parseEmbed(embedHash({ appId: 'memo', name: 'ad', param: 'a/b 日本語' }))).toEqual({ appId: 'memo', name: 'ad', param: 'a/b 日本語' });
  });

  it('# が付いていなければ、埋め込みページではない', () => {
    expect(parseEmbed('')).toBeNull();
    expect(parseEmbed('#')).toBeNull();
  });

  it('形が合わない指定は、理由を示して止める', () => {
    expect(() => parseEmbed('#memo')).toThrow('埋め込みページの指定が読めません: #memo');
    expect(() => parseEmbed('#memo//auto')).toThrow('埋め込みページの指定が読めません');
    expect(() => parseEmbed('#memo/ad/auto/extra')).toThrow('埋め込みページの指定が読めません');
  });
});
