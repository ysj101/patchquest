// 演習画面（spec §10）。演習票の見出し（課題・状態・達成印）、注入した架空サービスであることの表示、
// 動く教材アプリと利用者の切り替え、調査・対策・振り返りの道具を並べる
import { ANONYMOUS, type ActorKey, type AppDescriptor, type AppRequest } from '../contract';
import type { Scope } from '../evaluator/scenario';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { sealStates, seals, tabs } from './components';
import { fill, h } from './dom';
import { InvestigationPanel, storyPanel, type EventDescriber } from './investigation';
import { STATE_LABEL } from './labels';

export interface ExerciseActions {
  back(): void;
  /** 信頼された演習ハーネスとして、表示する利用者を切り替える */
  switchUser(actor: ActorKey): void;
  /** 選んでいる利用者で、最初の画面を開き直す */
  reloadView(): void;
  /** 現在の利用者として、ブラウザ内の呼び出しを送る。失敗したら理由を返す */
  send(request: AppRequest): Promise<string | null>;
}

/** 利用者の表示名。fixture に名前があれば添える */
export function actorLabel(actor: ActorKey, refs: Scope): string {
  if (actor === ANONYMOUS) return '未ログイン';
  const name = refs[`users.${actor}.name`];
  return name ? `${actor}（${String(name)}）` : actor;
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
  private readonly sealSlot = h('div', { class: 'ticket-seals' });
  private readonly toolTabs: ReturnType<typeof tabs>;
  private refs: Scope = {};

  constructor(private readonly actions: ExerciseActions) {
    this.investigation = new InvestigationPanel({ send: actions.send });
    this.toolTabs = tabs('演習の道具', [
      { id: 'story', label: '状況', panel: this.storySlot },
      { id: 'investigate', label: '調査', panel: this.investigation.element },
    ]);
    fill(
      this.element,
      h(
        'header',
        { class: 'ticket' },
        h('div', { class: 'ticket-main' }, this.ticket, this.title, this.state),
        this.sealSlot,
        h('div', { class: 'ticket-actions' }, h('button', { type: 'button', class: 'button button-quiet', on: { click: actions.back } }, '課題一覧へ戻る')),
      ),
      h(
        'p',
        { class: 'banner banner-notice', role: 'note' },
        h('strong', {}, '学習用に脆弱性を注入した架空のサービスです。'),
        ' 実在のサービスの診断結果ではありません。データはすべて架空で、このブラウザの中だけで動いています。',
      ),
      h(
        'div',
        { class: 'workbench' },
        h(
          'div',
          { class: 'app-pane' },
          h('div', { class: 'preview-bar' }, this.users, h('button', { type: 'button', class: 'button button-quiet', on: { click: actions.reloadView } }, '最初の画面を開き直す')),
          this.previewSlot,
        ),
        h('div', { class: 'tools' }, this.toolTabs.element),
      ),
    );
  }

  focus(): void {
    this.title.focus();
  }

  /** 演習を始めたときに、利用者・操作・状況を組み直す */
  setup(snapshot: ExerciseSnapshot, app: AppDescriptor, viewer: ActorKey, describeEvent: EventDescriber): void {
    this.refs = snapshot.refs;
    fill(
      this.users,
      h('legend', {}, '表示する利用者'),
      ...[...app.users, ANONYMOUS].map((actor) =>
        h(
          'label',
          { class: 'user-option' },
          h('input', { type: 'radio', name: 'viewer', value: actor, checked: actor === viewer, on: { change: () => this.actions.switchUser(actor) } }),
          actorLabel(actor, this.refs),
        ),
      ),
    );
    fill(this.storySlot, storyPanel(snapshot.pack.manifest.story));
    this.investigation.setup(snapshot.pack.manifest.actions, snapshot.refs, describeEvent);
    this.investigation.setViewer(actorLabel(viewer, this.refs));
    this.toolTabs.select('story');
  }

  setViewer(actor: ActorKey): void {
    this.investigation.setViewer(actorLabel(actor, this.refs));
  }

  label(actor: ActorKey): string {
    return actorLabel(actor, this.refs);
  }

  update(snapshot: ExerciseSnapshot): void {
    const { attempt, pack, defenseCurrent } = snapshot;
    this.title.textContent = pack.manifest.title;
    this.ticket.textContent = `演習票 ${attempt.attemptId.slice(0, 8)}・seed ${attempt.seed}`;
    this.state.textContent = STATE_LABEL[attempt.state];
    this.state.dataset.state = attempt.state;
    fill(this.sealSlot, seals(sealStates(attempt, defenseCurrent)));
  }
}
