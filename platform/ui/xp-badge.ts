// 演習票と一覧に報酬を表示し、新しく増えた XP だけを通知する。
import type { XpSummary } from '../progress/xp';
import { h } from './dom';
import { RewardNotice } from './reward-notice';

export function xpLabel(summary: XpSummary): string {
  return `Lv.${summary.level} ・ ${summary.total} XP`;
}

export class XpBadge {
  private readonly label = h('span');
  private readonly notice: RewardNotice<number>;
  readonly element = h('div', { class: 'xp-badge' }, this.label);

  constructor(announce: (message: string) => void) {
    this.notice = new RewardNotice(announce);
    this.element.append(this.notice.element);
  }

  reset(): void {
    this.notice.reset();
  }

  update(summary: XpSummary): void {
    this.label.textContent = xpLabel(summary);
    this.notice.update(summary.total, (previous, current) => {
      const gained = current - previous;
      return gained > 0 ? {
        nodes: [h('span', { class: 'xp-gain' }, `+${gained} XP`)],
        message: `${gained} XP を獲得（合計 ${current}）`,
      } : null;
    });
  }
}
