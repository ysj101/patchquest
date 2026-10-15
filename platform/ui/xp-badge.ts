// 演習票と一覧に報酬を表示し、新しく増えた XP だけを通知する。
import type { XpSummary } from '../progress/xp';
import { fill, h, renderGuard } from './dom';

export function xpLabel(summary: XpSummary): string {
  return `Lv.${summary.level} ・ ${summary.total} XP`;
}

export class XpBadge {
  readonly element = h('div', { class: 'xp-badge' });
  private guard = renderGuard();
  private previousTotal: number | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly announce: (message: string) => void) {}

  /** 再開した報酬は初回表示にし、獲得の演出を繰り返さない。 */
  reset(): void {
    clearTimeout(this.timer);
    this.guard = renderGuard();
    this.previousTotal = undefined;
  }

  update(summary: XpSummary): void {
    if (!this.guard.changed(String(summary.total))) return;
    clearTimeout(this.timer);
    const gained = this.previousTotal === undefined ? 0 : summary.total - this.previousTotal;
    fill(this.element, h('span', {}, xpLabel(summary)));
    if (gained > 0) {
      const gain = h('span', { class: 'xp-gain' }, `+${gained} XP`);
      this.element.append(gain);
      this.announce(`${gained} XP を獲得（合計 ${summary.total}）`);
      this.timer = setTimeout(() => gain.remove(), 4000);
    }
    this.previousTotal = summary.total;
  }
}
