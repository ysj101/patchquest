// 演習画面（spec §10）。演習票の見出し（課題・状態・達成印）、注入した架空サービスであることの表示、
// 動く教材アプリと利用者の切り替え、調査・対策・振り返りの道具を並べる
import { ANONYMOUS, type ActorKey, type AppDescriptor, type AppRequest } from '../contract';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { radioOption, sealStates, seals, settingsButton, tabs, type TabSpec } from './components';
import { fill, h } from './dom';
import { InvestigationPanel, storyPanel, type EventDescriber } from './investigation';
import { STATE_LABEL } from './labels';
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

export class ExerciseView {
  readonly element = h('section', { class: 'exercise', 'aria-labelledby': 'exercise-title', hidden: true });
  /** 教材アプリのプレビュー（隔離 iframe）を置く場所。iframe を作り直さないよう、この要素は使い回す */
  readonly previewSlot = h('div', { class: 'preview-slot', 'data-anchor': 'app-preview' });
  readonly investigation: InvestigationPanel;
  private readonly users = h('fieldset', { class: 'user-switcher', 'data-anchor': 'user-switcher' });
  private readonly storySlot = h('div', {});
  private readonly title = h('h1', { id: 'exercise-title', tabIndex: -1 });
  private readonly ticket = h('p', { class: 'ticket-id' });
  private readonly state = h('p', { class: 'state-stamp' });
  private readonly stages: StageProgress;
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
    this.stages = new StageProgress(announce);
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
        h('div', { class: 'ticket-main' }, this.ticket, this.title, this.state),
        this.sealSlot,
        h('div', { class: 'ticket-actions' }, h('button', { type: 'button', class: 'button button-quiet', on: { click: actions.back } }, '課題一覧へ戻る'), settingsButton(() => actions.openSettings())),
        this.stages.element,
      ),
      h(
        'p',
        { class: 'banner banner-notice', role: 'note' },
        h('strong', {}, '学習用に脆弱性を注入した架空のサービスです。'),
        ' 実在のサービスの診断結果ではありません。データはすべて架空で、このブラウザの中だけで動いています。',
      ),
      extras.callout,
      this.briefing,
      this.workbench,
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
    const story = snapshot.pack.manifest.story;
    fill(this.storySlot, storyPanel(story), h('button', { type: 'button', class: 'button button-quiet', on: { click: () => this.openBriefing() } }, '導入をもう一度見る'), this.storyFooter);
    fill(
      this.briefing,
      h('h2', { id: 'briefing-title' }, h('span', { class: 'eyebrow', 'aria-hidden': true }, 'SECURITY ALERT'), 'セキュリティ警報'),
      h('p', { class: 'incident' }, story.incident),
      h('h3', {}, '依頼'),
      h('p', { class: 'briefing-goal' }, story.goal),
      this.launch,
      h('p', { class: 'note' }, 'Esc キーでも導入を飛ばして始められます。'),
    );
    this.setBriefingVisible(showBriefing);
    this.investigation.setup(snapshot.pack.manifest.actions, snapshot.refs, describeEvent);
    this.investigation.setViewer(actorLabel(viewer));
    this.toolTabs.select('story');
  }

  private buildWorkbench(): void {
    fill(
      this.workbench,
      h('div', { class: 'app-pane' },
        h('div', { class: 'preview-bar' }, this.users, h('button', { type: 'button', class: 'button button-quiet', on: { click: () => this.actions.reloadView() } }, '最初の画面を開き直す')),
        this.previewSlot,
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

  setViewer(actor: ActorKey): void {
    this.investigation.setViewer(actorLabel(actor));
  }

  label(actor: ActorKey): string {
    return actorLabel(actor);
  }

  update(snapshot: ExerciseSnapshot): void {
    const { attempt, pack, defenseCurrent } = snapshot;
    this.stages.update(attempt, defenseCurrent);
    this.title.textContent = pack.manifest.title;
    this.ticket.textContent = `演習票 ${attempt.attemptId.slice(0, 8)}・seed ${attempt.seed}`;
    this.state.textContent = STATE_LABEL[attempt.state];
    this.state.dataset.state = attempt.state;
    fill(this.sealSlot, seals(sealStates(attempt, defenseCurrent)));
  }
}
