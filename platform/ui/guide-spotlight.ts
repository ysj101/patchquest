// 操作ガイドのスポットライト。案内先のまわりだけを残して画面を暗くし、ガイドの吹き出しを案内先のそばに置く。
// 案内先が変わったときだけ位置をなめらかに動かし、スクロールや大きさの変化にはそのまま追従する。案内先が画面に見えないときは暗くせず、吹き出しを画面の隅に置く
import { h } from './dom';

/** 案内先と暗幕の穴のあいだの余白 */
const PAD = 6;
/** 穴と吹き出しのあいだ */
const GAP = 14;
/** 画面の端から空ける幅 */
const EDGE = 12;
/** 案内先が変わったあと、位置を動かす時間（CSS の transition と合わせる） */
const MOVE_MS = 650;

type Placement = 'below' | 'above' | 'right' | 'left' | 'dock';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Spot {
  placement: Placement;
  left: number;
  top: number;
  /** 吹き出しの矢印の位置（吹き出しの辺に沿った距離） */
  arrow: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** 吹き出しを置く場所を、下・上・右・左の順に、画面に収まり案内先に重ならない最初の場所から選ぶ。どこにも収まらなければ隅に置く */
export function placeBubble(target: Box, bubble: { width: number; height: number }, view: { width: number; height: number }): Spot {
  const hole = { left: target.left - PAD, top: target.top - PAD, right: target.left + target.width + PAD, bottom: target.top + target.height + PAD };
  const centerX = target.left + target.width / 2;
  const centerY = target.top + target.height / 2;
  const fitsX = (left: number) => left >= EDGE && left + bubble.width <= view.width - EDGE;
  const fitsY = (top: number) => top >= EDGE && top + bubble.height <= view.height - EDGE;
  const alongX = clamp(target.left, EDGE, view.width - bubble.width - EDGE);
  const alongY = clamp(target.top, EDGE, view.height - bubble.height - EDGE);
  const candidates: Spot[] = [
    { placement: 'below', left: alongX, top: hole.bottom + GAP, arrow: centerX - alongX },
    { placement: 'above', left: alongX, top: hole.top - GAP - bubble.height, arrow: centerX - alongX },
    { placement: 'right', left: hole.right + GAP, top: alongY, arrow: centerY - alongY },
    { placement: 'left', left: hole.left - GAP - bubble.width, top: alongY, arrow: centerY - alongY },
  ];
  const spot = candidates.find((candidate) => fitsX(candidate.left) && fitsY(candidate.top));
  if (!spot) return { placement: 'dock', left: 0, top: 0, arrow: 0 };
  const side = spot.placement === 'below' || spot.placement === 'above' ? bubble.width : bubble.height;
  return { ...spot, arrow: clamp(spot.arrow, 20, side - 20) };
}

export class GuideSpotlight {
  /** 暗幕と穴。ガイドの中に置き、ガイドを閉じれば一緒に消える */
  readonly element = h('div', { class: 'guide-spot', 'aria-hidden': true, hidden: true }, h('span', { class: 'guide-spot-edge' }));
  private target: Element | null = null;
  private frame = 0;
  private last = '';
  private moving: ReturnType<typeof setTimeout> | undefined;

  /** panel は位置を動かすガイド全体、card は大きさを測る吹き出し */
  constructor(
    private readonly panel: HTMLElement,
    private readonly card: HTMLElement,
  ) {}

  /** 案内先を照らす。null なら暗幕を外し、吹き出しを隅に置く */
  follow(target: Element | null): void {
    if (target !== this.target) {
      // 見えている穴から次の案内先へ移るときだけ、位置をなめらかに動かす
      if (this.target && !this.element.hidden && target) this.startMoving();
      this.target = target;
    }
    if (!this.frame) this.frame = requestAnimationFrame(() => this.tick());
  }

  private startMoving(): void {
    this.panel.dataset.moving = '';
    clearTimeout(this.moving);
    this.moving = setTimeout(() => delete this.panel.dataset.moving, MOVE_MS);
  }

  /** ガイドが見えている間は毎フレーム位置を確かめ、変わったときだけ書き直す */
  private tick(): void {
    this.frame = 0;
    if (this.panel.hidden) {
      this.last = '';
      return;
    }
    this.place();
    this.frame = requestAnimationFrame(() => this.tick());
  }

  private visibleRect(): DOMRect | null {
    const rect = this.target?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const onScreen = rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
    return onScreen ? rect : null;
  }

  private place(): void {
    const rect = this.visibleRect();
    const view = { width: window.innerWidth, height: window.innerHeight };
    const bubble = { width: this.card.offsetWidth, height: this.card.offsetHeight };
    const key = rect ? [rect.left, rect.top, rect.width, rect.height, view.width, view.height, bubble.width, bubble.height].map(Math.round).join(',') : 'dock';
    if (key === this.last) return;
    this.last = key;
    if (!rect) {
      this.element.hidden = true;
      this.dock();
      return;
    }
    this.element.hidden = false;
    Object.assign(this.element.style, { left: `${rect.left - PAD}px`, top: `${rect.top - PAD}px`, width: `${rect.width + PAD * 2}px`, height: `${rect.height + PAD * 2}px` });
    const spot = placeBubble(rect, bubble, view);
    if (spot.placement === 'dock') {
      this.dock();
      return;
    }
    this.panel.dataset.placement = spot.placement;
    Object.assign(this.panel.style, { left: `${spot.left}px`, top: `${spot.top}px` });
    this.panel.style.setProperty('--guide-arrow', `${spot.arrow}px`);
  }

  private dock(): void {
    this.panel.dataset.placement = 'dock';
    Object.assign(this.panel.style, { left: '', top: '' });
  }
}
