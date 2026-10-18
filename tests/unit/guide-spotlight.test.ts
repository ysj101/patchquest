// 操作ガイドの吹き出しを、画面に収まり案内先に重ならない場所へ置くことを確かめる。
import { expect, it } from 'vitest';
import { placeBubble } from '../../platform/ui/guide-spotlight';

const view = { width: 1280, height: 800 };
const bubble = { width: 360, height: 180 };

it('下に余白があれば案内先の下に置き、矢印は案内先の中央を指す', () => {
  const spot = placeBubble({ left: 600, top: 100, width: 140, height: 44 }, bubble, view);
  expect(spot).toEqual({ placement: 'below', left: 600, top: 164, arrow: 70 });
});

it('下に入らなければ上に置く', () => {
  const spot = placeBubble({ left: 600, top: 600, width: 140, height: 44 }, bubble, view);
  expect(spot.placement).toBe('above');
  expect(spot.top).toBe(600 - 6 - 14 - 180);
});

it('上下に入らない縦長の案内先では、右、それも無理なら左に置く', () => {
  expect(placeBubble({ left: 100, top: 20, width: 500, height: 760 }, bubble, view).placement).toBe('right');
  expect(placeBubble({ left: 700, top: 20, width: 560, height: 760 }, bubble, view).placement).toBe('left');
});

it('右端の案内先でも吹き出しは画面からはみ出さず、矢印は吹き出しの角から 20px 以上内側に置く', () => {
  const spot = placeBubble({ left: 1240, top: 100, width: 30, height: 30 }, bubble, view);
  expect(spot.left + bubble.width).toBeLessThanOrEqual(view.width - 12);
  expect(spot.arrow).toBe(bubble.width - 20);
});

it('どこにも収まらなければ画面の隅に置く', () => {
  expect(placeBubble({ left: 0, top: 0, width: 1280, height: 800 }, bubble, view).placement).toBe('dock');
});
