// 演習画面（spec §10）。調査デスクの形で、上に演習票（課題・状態・達成印・架空サービスの表示）、
// 左に依頼とステージ、中央に動く教材アプリと観測ログ、右に状況・調査・対策・振り返りの道具、下に演習票番号を並べる
import { ANONYMOUS, type ActorKey, type AppDescriptor, type AppRequest } from '../contract';
import { sealStates, stageStates } from '../progress/stages';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { radioOption, seals, settingsButton, tabs, type TabSpec } from './components';
import { fill, h } from './dom';
import { InvestigationPanel, storyPanel, type EventDescriber } from './investigation';
import { STATE_LABEL } from './labels';
import { AchievementToast } from './achievement-toast';
import { XpBadge } from './xp-badge';
import { characterVoice, guideVoice } from './characters';
import { StageProgress } from './stage-progress';

export interface ExerciseActions {
  openSettings(): void;
  back(): void;
  /** 導入を閉じたことを知らせる。到達済みの出来事はガイド側で無視する */
  briefed(): void;
  /** 信頼された演習ハーネスとして、表示する利用者を切り替える */
  switchUser(actor: ActorKey): void;
  /** 選んでいる利用者で、最初の画面を開き直す */
  reloadView(): void;
  /** 現在の利用者として、ブラウザ内の呼び出しを送る。失敗したら理由を返す */
  send(request: AppRequest): Promise<string | null>;
}

/** 利用者の表示名 */
export function actorLabel(actor: ActorKey): string {
  return actor === ANONYMOUS ? '未ログイン' : actor;
}

/** いまのステージに対応する、画面上部の一行。課題ごとの文は置かない */
const NOW_DOING = {
  briefed: '依頼を読んで、ミッションを始めます。',
  investigated: '調査を開いて、手がかりを集めます。',
  reproduced: '同じ操作で、不具合を再現します。',
  repaired: '対策を選んで、適用します。',
  verified: '攻撃と普段の使い方を検証します。',
} as const;

const NOW_DONE = '振り返りで、原因と対策を確認します。';

/** 状況タブから、左の依頼と重なる問い合わせと目標を外す。依頼の文は左に 1 か所だけ残す */
function withoutRepeatedRequest(panel: HTMLElement): HTMLElement {
  for (const section of [...panel.querySelectorAll(':scope > section.tool-section')]) {
    const title = section.querySelector('h3')?.textContent;
    if (title === '問い合わせ' || title === '目標') section.remove();
  }
  return panel;
}

export class ExerciseView {
  readonly element = h('section', { class: 'exercise', 'aria-labelledby': 'exercise-title', hidden: true });
  /** 教材アプリのプレビュー（隔離 iframe）を置く場所。iframe を作り直さないよう、この要素は使い回す */
  readonly previewSlot = h('div', { class: 'preview-slot', 'data-anchor': 'app-preview' });
  readonly investigation: InvestigationPanel;
  private readonly users = h('fieldset', { class: 'user-switcher', 'data-anchor': 'user-switcher' });
  private readonly storySlot = h('div', {});
  private readonly title = h('h1', { id: 'exercise-title', tabIndex: -1 });
  private readonly ticket = h('p', { class: 'ticket-id' });
  private readonly request = h('div', { class: 'desk-request' });
  private readonly nowDoing = h('p', { class: 'now-doing' });
  private readonly state = h('p', { class: 'state-stamp' });
  private readonly stages: StageProgress;
  readonly xp: XpBadge;
  readonly achievements: AchievementToast;
  private readonly sealSlot = h('div', { class: 'ticket-seals' });
  private readonly toolTabs: ReturnType<typeof tabs>;
  private readonly storyFooter: HTMLElement;
  private readonly workbench = h('div', { class: 'workbench' });
  private readonly briefing = h('section', { class: 'mission-briefing', 'data-anchor': 'briefing', 'aria-labelledby': 'briefing-title', hidden: true });
  private readonly launch = h('button', { type: 'button', class: 'button button-primary button-chunky', on: { click: () => this.closeBriefing() } }, 'ミッション開始');

  constructor(
    private readonly actions: ExerciseActions,
    /** 状況・調査に続けて並べるタブと、状況タブの末尾に置く要素（ヒントなど） */
    extras: { tabs: TabSpec[]; storyFooter: HTMLElement; callout: HTMLElement },
    announce: (message: string) => void,
  ) {
    this.xp = new XpBadge(announce);
    this.achievements = new AchievementToast(announce);
    this.stages = new StageProgress(announce);
    this.stages.header.append(this.xp.element, this.achievements.element);
    this.storyFooter = extras.storyFooter;
    this.investigation = new InvestigationPanel({ send: actions.send });
    this.toolTabs = tabs('演習の道具', [
      { id: 'story', label: '状況', panel: this.storySlot },
      { id: 'investigate', label: '調査', panel: this.investigation.element },
      ...extras.tabs,
    ]);
    this.buildWorkbench();
    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.briefing.hidden) {
        event.preventDefault();
        this.closeBriefing();
      }
    });
    fill(
      this.element,
      h(
        'header',
        { class: 'ticket' },
        h('button', { type: 'button', class: 'button button-quiet ticket-back', on: { click: actions.back } }, '課題一覧へ戻る'),
        h('div', { class: 'ticket-main' }, this.title, this.state),
        h('p', { class: 'fictional-label', role: 'note' }, h('strong', {}, '学習用に脆弱性を注入した架空のサービスです。')),
        this.sealSlot,
        settingsButton(() => actions.openSettings()),
      ),
      this.nowDoing,
      extras.callout,
      this.briefing,
      this.workbench,
      h(
        'footer',
        { class: 'desk-status' },
        this.ticket,
        h('p', {}, '実在のサービスの診断結果ではありません。データはすべて架空で、このブラウザの中だけで動いています。'),
      ),
    );
  }

  focus(): void {
    if (this.briefing.hidden) this.title.focus();
    else this.launch.focus();
  }

  /** 演習を始めたときに、利用者・操作・状況を組み直す */
  setup(snapshot: ExerciseSnapshot, app: AppDescriptor, viewer: ActorKey, describeEvent: EventDescriber, showBriefing: boolean): void {
    fill(
      this.users,
      h('legend', {}, '表示する利用者'),
      ...[...app.users, ANONYMOUS].map((actor) =>
        radioOption(
          { name: 'viewer', value: actor, checked: actor === viewer, className: 'user-option', onChange: () => this.actions.switchUser(actor) },
          actorLabel(actor),
        ),
      ),
    );
    this.stages.reset();
    this.xp.reset();
    this.achievements.reset();
    const story = snapshot.pack.manifest.story;
    fill(this.request, h('h2', {}, '依頼'), h('p', {}, story.incident));
    fill(this.storySlot, withoutRepeatedRequest(storyPanel(story)), h('button', { type: 'button', class: 'button button-quiet', on: { click: () => this.openBriefing() } }, '導入をもう一度見る'), this.storyFooter);
    fill(
      this.briefing,
      h('h2', { id: 'briefing-title' }, h('span', { class: 'eyebrow', 'aria-hidden': true }, 'SECURITY ALERT'), 'セキュリティ警報'),
      story.requester ? characterVoice({ name: story.requester.name, role: story.requester.role, text: story.incident }, { bodyClass: 'incident' }) : h('p', { class: 'incident' }, story.incident),
      guideVoice('briefing'),
      h('h3', {}, '依頼'),
      h('p', { class: 'briefing-goal' }, story.goal),
      this.launch,
      h('p', { class: 'note' }, 'Esc キーでも導入を飛ばして始められます。'),
    );
    this.setBriefingVisible(showBriefing);
    this.showNow(snapshot.attempt, snapshot.defenseCurrent);
    this.investigation.setup(snapshot.pack.manifest.actions, snapshot.refs, describeEvent);
    this.investigation.setViewer(actorLabel(viewer));
    this.toolTabs.select('story');
  }

  private buildWorkbench(): void {
    fill(
      this.workbench,
      h('aside', { class: 'desk-brief', 'aria-label': '依頼とステージ' }, this.request, this.stages.element),
      h('div', { class: 'app-pane' },
        h('div', { class: 'preview-bar' }, this.users, h('button', { type: 'button', class: 'button button-quiet', on: { click: () => this.actions.reloadView() } }, '最初の画面を開き直す')),
        this.previewSlot,
        this.investigation.logSection,
      ),
      h('div', { class: 'tools' }, this.toolTabs.element),
    );
  }

  private setBriefingVisible(visible: boolean): void {
    this.briefing.hidden = !visible;
    this.workbench.hidden = visible;
  }

  private openBriefing(): void {
    this.setBriefingVisible(true);
    this.focus();
  }

  private closeBriefing(): void {
    this.setBriefingVisible(false);
    this.focus();
    this.actions.briefed();
  }

  private showNow(attempt: ExerciseSnapshot['attempt'], defenseCurrent: boolean): void {
    const current = stageStates(attempt, defenseCurrent).find((stage) => stage.current);
    // 最終検証のステージは、防御が済んだあとの残りが振り返り
    const reflecting = current?.id === 'verified' && attempt.badges.defense.achieved && defenseCurrent;
    const sentence = reflecting || !current ? NOW_DONE : NOW_DOING[current.id];
    this.nowDoing.textContent = `今やること：${sentence}`;
  }

  setViewer(actor: ActorKey): void {
    this.investigation.setViewer(actorLabel(actor));
  }

  label(actor: ActorKey): string {
    return actorLabel(actor);
  }

  update(snapshot: ExerciseSnapshot): void {
    const { attempt, pack, defenseCurrent } = snapshot;
    this.stages.update(attempt, defenseCurrent);
    this.showNow(attempt, defenseCurrent);
    this.title.textContent = pack.manifest.title;
    this.ticket.textContent = `演習票 ${attempt.attemptId.slice(0, 8)}・seed ${attempt.seed}`;
    this.state.textContent = STATE_LABEL[attempt.state];
    this.state.dataset.state = attempt.state;
    fill(this.sealSlot, seals(sealStates(attempt, defenseCurrent), 'small'));
  }
}
