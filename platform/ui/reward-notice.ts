// 報酬の前回との差分を通知し、一時表示と再開時の初期化を共通で扱う。
import { fill, h } from './dom';

type Notice = { nodes: HTMLElement[]; message: string };

export class RewardNotice<State> {
  readonly element = h('div');
  private previous: State | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly announce: (message: string) => void) {}

  /** 初回表示では演出せず、以後は呼び出し元が導いた差分だけを表示する。 */
  update(current: State, difference: (previous: State, current: State) => Notice | null): void {
    const previous = this.previous;
    this.previous = current;
    if (previous === undefined) return;
    const notice = difference(previous, current);
    if (!notice) return;
    clearTimeout(this.timer);
    fill(this.element, ...notice.nodes);
    this.announce(notice.message);
    this.timer = setTimeout(() => fill(this.element), 4000);
  }

  /** 再開した報酬を初回表示として扱い、前の一時表示とタイマーを消す。 */
  reset(): void {
    clearTimeout(this.timer);
    fill(this.element);
    this.previous = undefined;
  }
}
