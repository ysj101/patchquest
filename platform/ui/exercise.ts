// 演習画面（spec §10）。調査デスクの形で、上に演習票（課題・達成印）、
// その下の帯に依頼（ボタンに畳み、重ねて出す）・ステージ・守るものと壊さないこと、左に動く教材アプリと観測ログ、右に調査・対策・振り返りの道具、
// 下に演習票番号と架空サービスの表示を並べる
import { ANONYMOUS, type ActorKey, type AppDescriptor, type AppRequest } from '../contract';
import { sealStates, stageStates } from '../progress/stages';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { radioOption, seals, settingsButton, tabs, type TabSpec } from './components';
import { fill, h, renderGuard } from './dom';
import { labelPopover } from './info-popover';
import { InvestigationPanel, describersOf, type DescribingApp } from './investigation';
import { AchievementToast } from './achievement-toast';
import { requesterVoice } from './characters';
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
  investigated: '調査で、手がかりを集めます。',
  reproduced: '同じ操作をして、問題を再現します。',
  repaired: '対策を選びます。',
  verified: '攻撃とふだんの使い方をテストします。',
} as const;

/** 操作で直す課題（repair: record）では、対策を選ぶのではなく教材アプリを操作して直す */
const NOW_REPAIR_BY_OPERATION = '教材アプリを操作して、問題を直します。';

/** 定型の操作がない課題では、調査タブではなく教材アプリの画面で調べる */
const NOW_INVESTIGATE_IN_APP = '教材アプリを操作して、手がかりを集めます。';

const NOW_DONE = '振り返りで、原因と対策を確認します。';


function nowDoing(stage: keyof typeof NOW_DOING, manifest: ExerciseSnapshot['pack']['manifest']): string {
  if (stage === 'repaired' && manifest.repair) return NOW_REPAIR_BY_OPERATION;
  if (stage === 'investigated' && manifest.actions.length === 0) return NOW_INVESTIGATE_IN_APP;
  return NOW_DOING[stage];
}

export class ExerciseView {
  readonly element = h('section', { class: 'exercise', 'aria-labelledby': 'exercise-title', hidden: true });
  /** 教材アプリのプレビュー（隔離 iframe）を置く場所。iframe を作り直さないよう、この要素は使い回す */
  readonly previewSlot = h('div', { class: 'preview-slot', 'data-anchor': 'app-preview' });
  readonly investigation: InvestigationPanel;
  private readonly users = h('fieldset', { class: 'user-switcher', 'data-anchor': 'user-switcher' });
  private readonly title = h('h1', { id: 'exercise-title', tabIndex: -1 });
  private readonly ticket = h('p', { class: 'ticket-id' });
  private readonly request = h('div', { class: 'desk-request' });
  private incident = '';
  /** 守るものと壊さないこと。対策を選ぶ基準なので、畳まずに帯へ常に出す */
  private readonly goal = h('dl', { class: 'desk-goal', 'data-anchor': 'story' });
  private readonly nowDoing = h('p', { class: 'now-doing' });
  /** 続きから始めて前回の対策を適用し直したときに、作り直した内容を知らせる */
  private readonly resumeNote = h('p', { class: 'banner banner-ok', hidden: true });
  private readonly stages: StageProgress;
  readonly achievements: AchievementToast;
  private readonly sealSlot = h('div', { class: 'ticket-seals' });
  private readonly sealGuard = renderGuard();
  private readonly toolTabs: ReturnType<typeof tabs>;
  private readonly workbench = h('div', { class: 'workbench' });
  private readonly briefing = h('section', { class: 'mission-briefing', 'data-anchor': 'briefing', 'aria-labelledby': 'briefing-title', hidden: true });
  private readonly launch = h('button', { type: 'button', class: 'button button-primary button-chunky', on: { click: () => this.closeBriefing() } }, 'ミッション開始');

  constructor(
    private readonly actions: ExerciseActions,
    /** 調査に続けて並べるタブと、調査タブの末尾に置く要素（ヒントなど） */
    extras: { tabs: TabSpec[]; investigationFooter: HTMLElement; callout: HTMLElement },
    private readonly announce: (message: string) => void,
  ) {
    this.achievements = new AchievementToast(announce);
    this.stages = new StageProgress(announce);
    this.investigation = new InvestigationPanel({ send: actions.send }, extras.investigationFooter);
    this.toolTabs = tabs('演習の道具', [
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
        h('div', { class: 'ticket-main' }, this.title),
        this.sealSlot,
        settingsButton(() => actions.openSettings()),
      ),
      this.nowDoing,
      this.resumeNote,
      extras.callout,
      this.briefing,
      this.workbench,
      h(
        'footer',
        { class: 'desk-status' },
        this.ticket,
        h('p', { class: 'fictional-label', role: 'note' }, '学習用に、わざとセキュリティホールを入れた架空のサービスです。このブラウザの中だけで動いています。'),
      ),
    );
  }

  focus(): void {
    if (this.briefing.hidden) this.title.focus();
    else this.launch.focus();
  }

  /** 演習を始めたときに、利用者・操作・依頼を組み直す */
  setup(snapshot: ExerciseSnapshot, app: DescribingApp & { descriptor: AppDescriptor }, viewer: ActorKey, showBriefing: boolean): void {
    fill(
      this.users,
      h('legend', {}, '表示する利用者'),
      ...[...app.descriptor.users, ANONYMOUS].map((actor) =>
        radioOption(
          { name: 'viewer', value: actor, checked: actor === viewer, className: 'user-option', onChange: () => this.actions.switchUser(actor) },
          actorLabel(actor),
        ),
      ),
    );
    this.stages.reset();
    this.achievements.reset();
    const story = snapshot.pack.manifest.story;
    this.incident = story.incident;
    this.showRequest();
    fill(this.goal, h('dt', {}, '守るもの'), h('dd', {}, story.protectedAssets.join('／')), h('dt', {}, '壊さないこと'), h('dd', {}, story.normalUse.join('／')));
    fill(
      this.briefing,
      h('h2', { id: 'briefing-title' }, h('span', { class: 'eyebrow', 'aria-hidden': true }, 'SECURITY ALERT'), 'セキュリティ警報'),
      story.requester ? requesterVoice({ ...story.requester, text: story.incident }, 'incident') : h('p', { class: 'incident' }, story.incident),
      h('h3', {}, '依頼'),
      h('p', { class: 'briefing-goal' }, story.goal),
      this.launch,
    );
    this.setBriefingVisible(showBriefing);
    this.showResumed(snapshot);
    this.showNow(snapshot);
    this.investigation.setup({ ...snapshot.pack.manifest, workedExample: story.workedExample }, snapshot.refs, describersOf(app));
    this.investigation.setViewer(actorLabel(viewer));
    this.toolTabs.select('investigate');
  }

  private buildWorkbench(): void {
    fill(
      this.workbench,
      h('aside', { class: 'desk-brief', 'aria-label': '依頼とステージ' }, this.request, this.stages.element, this.achievements.element, this.goal),
      h('div', { class: 'app-pane' },
        h('div', { class: 'preview-bar' }, this.users, h('button', { type: 'button', class: 'button button-quiet', on: { click: () => this.actions.reloadView() } }, '最初の画面を開き直す')),
        this.previewSlot,
        this.investigation.logSection,
      ),
      h('div', { class: 'tools' }, this.toolTabs.element),
    );
  }

  /** 依頼のボタンと、重ねて出す問い合わせの文・導入への戻り口。組み直すと、開いていた説明は閉じる */
  private showRequest(): void {
    fill(this.request, labelPopover('依頼', h('p', {}, this.incident), h('button', { type: 'button', class: 'button button-quiet', on: { click: () => this.openBriefing() } }, '導入をもう一度見る')));
  }

  private setBriefingVisible(visible: boolean): void {
    this.briefing.hidden = !visible;
    this.workbench.hidden = visible;
  }

  private openBriefing(): void {
    // 導入から戻ったときに、依頼の説明が開いたまま残らないようにする
    this.showRequest();
    this.setBriefingVisible(true);
    this.focus();
  }

  private closeBriefing(): void {
    this.setBriefingVisible(false);
    this.focus();
    this.actions.briefed();
  }

  /** 開始前チェックの直後に対策が付いているのは、続きから始めて前回の対策を適用し直したときだけ */
  private showResumed({ attempt, pack }: ExerciseSnapshot): void {
    const resumed = pack.manifest.defenses.find((defense) => defense.id === attempt.appliedDefense);
    this.resumeNote.hidden = !resumed;
    if (!resumed) return;
    const message = `データを最初の状態に戻し、前回の対策「${resumed.label}」を使い直しました`;
    this.resumeNote.textContent = `${message}。`;
    this.announce(message);
  }

  private showNow({ attempt, defenseCurrent, pack }: ExerciseSnapshot): void {
    const current = stageStates(attempt, defenseCurrent).find((stage) => stage.current);
    // 最終検証のステージは、防御が済んだあとの残りが振り返り
    const reflecting = current?.id === 'verified' && attempt.badges.defense.achieved && defenseCurrent;
    let sentence: string = NOW_DONE;
    if (current && !reflecting) sentence = nowDoing(current.id, pack.manifest);
    this.nowDoing.textContent = `今やること：${sentence}`;
  }

  setViewer(actor: ActorKey): void {
    this.investigation.setViewer(actorLabel(actor));
  }


  update(snapshot: ExerciseSnapshot): void {
    const { attempt, pack, defenseCurrent } = snapshot;
    this.stages.update(attempt, defenseCurrent);
    this.showNow(snapshot);
    this.title.textContent = pack.manifest.title;
    this.ticket.textContent = `演習票 ${attempt.attemptId.slice(0, 8)}・seed ${attempt.seed}`;
    // 押印の動きを通知のたびに繰り返さないよう、変わったときだけ描き直す
    const states = sealStates(attempt, defenseCurrent);
    if (this.sealGuard.changed(JSON.stringify(states))) fill(this.sealSlot, seals(states, 'small'));
  }
}
