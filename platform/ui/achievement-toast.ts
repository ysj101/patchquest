// 新しく解除された実績の名前を、共通の報酬通知で短く表示する。
import { ACHIEVEMENTS, type AchievementId, type UnlockedAchievements } from '../progress/achievements';
import { h } from './dom';
import { RewardNotice } from './reward-notice';

export class AchievementToast {
  private readonly notice: RewardNotice<Set<AchievementId>>;
  readonly element: HTMLElement;

  constructor(announce: (message: string) => void) {
    this.notice = new RewardNotice(announce);
    this.element = this.notice.element;
    this.element.className = 'achievement-toast';
  }

  reset(): void {
    this.notice.reset();
  }

  update(unlocked: UnlockedAchievements): void {
    this.notice.update(new Set(Object.keys(unlocked) as AchievementId[]), (previous, current) => {
      const messages = ACHIEVEMENTS.filter(({ id }) => current.has(id) && !previous.has(id)).map(({ name }) => `実績解除：${name}`);
      return messages.length ? {
        nodes: messages.map((message) => h('p', { class: 'achievement-gain' }, message)), message: messages.join('。'),
      } : null;
    });
  }
}
