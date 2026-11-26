// 小さな説明（ポップオーバー）の開閉の遷移表を、操作の列をすべてたどって確かめる。
import { describe, expect, it } from 'vitest';
import { POPOVER_MACHINE, isPopoverOpen, nextPopoverState, type PopoverEvent, type PopoverState } from '../../platform/ui/popover-model';

const EVENTS: PopoverEvent[] = ['press', 'escape', 'enter', 'leave'];
const STATES = Object.keys(POPOVER_MACHINE) as PopoverState[];
/** マウスが乗っている状態 */
const OVER: PopoverState[] = ['peek', 'pinned-over', 'dismissed'];

const run = (...events: PopoverEvent[]) => events.reduce<PopoverState>(nextPopoverState, 'closed');

describe('ポップオーバーの開閉', () => {
  it('閉じた状態から、すべての状態に着ける', () => {
    const seen = new Set<PopoverState>(['closed']);
    for (let size = 0; size !== seen.size;) {
      size = seen.size;
      for (const state of [...seen]) for (const event of EVENTS) seen.add(nextPopoverState(state, event));
    }
    expect([...seen].sort()).toEqual([...STATES].sort());
  });

  it('マウスが乗った・離れたは、マウスの位置だけを変える（乗っている状態と外の状態を行き来する）', () => {
    for (const state of STATES) {
      const over = OVER.includes(state);
      expect(OVER.includes(nextPopoverState(state, 'enter')), `${state} + enter`).toBe(true);
      expect(OVER.includes(nextPopoverState(state, 'leave')), `${state} + leave`).toBe(false);
      for (const event of ['press', 'escape'] as const) expect(OVER.includes(nextPopoverState(state, event)), `${state} + ${event}`).toBe(over);
    }
  });

  it('押すと開閉が入れ替わり（マウスを乗せただけで開いていたものは、開いたまま留める）、Esc は開いているときだけ閉じる', () => {
    for (const state of STATES) {
      expect(isPopoverOpen(nextPopoverState(state, 'press')), `${state} + press`).toBe(!isPopoverOpen(state) || state === 'peek');
      expect(isPopoverOpen(nextPopoverState(state, 'escape')), `${state} + escape`).toBe(false);
      if (!isPopoverOpen(state)) expect(nextPopoverState(state, 'escape')).toBe(state);
    }
  });

  it('押して開いたものは、マウスが離れても開いたまま', () => {
    expect(run('enter', 'press', 'leave')).toBe('pinned');
    expect(isPopoverOpen(run('press', 'enter', 'leave'))).toBe(true);
  });

  it('マウスを乗せたまま閉じたら、離れるまで開き直さない', () => {
    expect(run('enter', 'press', 'press')).toBe('dismissed');
    expect(run('enter', 'escape')).toBe('dismissed');
    expect(run('enter', 'press', 'press', 'leave', 'enter')).toBe('peek');
  });

  it('マウスが外にあるときにキーで閉じたあとも、マウスを乗せれば開く', () => {
    expect(run('press', 'escape')).toBe('closed');
    expect(run('press', 'press', 'enter')).toBe('peek');
    expect(run('press', 'escape', 'enter')).toBe('peek');
  });
});
