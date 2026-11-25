// 小さな説明（ポップオーバー）の開閉の状態遷移。DOM に依存しない

/**
 * closed: 閉じている / peek: マウスを乗せただけで開いている / pinned: 押して開いた（マウスは外にある） /
 * pinned-over: 押して開いた（マウスが乗っている） / dismissed: 閉じた直後で、マウスがまだ乗っている（離れるまで開き直さない）
 */
export type PopoverState = 'closed' | 'peek' | 'pinned' | 'pinned-over' | 'dismissed';

/** press: ボタンを押した（クリック・Enter・Space） / escape: Esc を押した / enter・leave: マウスが乗った・離れた */
export type PopoverEvent = 'press' | 'escape' | 'enter' | 'leave';

/** 開閉の遷移表（状態 × 操作 → 次の状態）。ここにない組み合わせでは状態を変えない。docs/formal/Popover.tla が同じ表を検査する */
export const POPOVER_MACHINE: Readonly<Record<PopoverState, Readonly<Partial<Record<PopoverEvent, PopoverState>>>>> = {
  closed: { press: 'pinned', enter: 'peek' },
  peek: { press: 'pinned-over', escape: 'dismissed', leave: 'closed' },
  pinned: { press: 'closed', escape: 'closed', enter: 'pinned-over' },
  'pinned-over': { press: 'dismissed', escape: 'dismissed', leave: 'pinned' },
  dismissed: { press: 'pinned-over', leave: 'closed' },
};

export function nextPopoverState(state: PopoverState, event: PopoverEvent): PopoverState {
  return POPOVER_MACHINE[state][event] ?? state;
}

/** 説明が見えている状態か */
export function isPopoverOpen(state: PopoverState): boolean {
  return state === 'peek' || state === 'pinned' || state === 'pinned-over';
}
