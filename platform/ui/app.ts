// 学習UIの組み立て。課題一覧・開始前チェック・演習画面を切り替え、進行（Orchestrator）と保存（ProgressStore）をつなぐ
import { catalog } from '@catalog';
import { ANONYMOUS, RuntimeError, isInExercise, satisfies, type ActorKey, type AppRequest, type Exchange, type SessionToken } from '../contract';
import { Evaluator } from '../evaluator/evaluator';
import { Orchestrator, type ExerciseSnapshot } from '../orchestrator/orchestrator';
import { ProgressStore } from '../progress/store';
import { BrowserRuntimeAdapter } from '../../runtimes/browser/adapter';
import { browserEffects } from './browser-effects';
import { openEffectSettings } from './effect-settings-panel';
import { confirmDialog } from './components';
import { announce, fill, h } from './dom';
import { DebriefPanel, HintsPanel } from './debrief';
import { ExerciseView } from './exercise';
import { GuidePanel } from './guide';
import { missionList, type MissionEntry } from './mission-list';
import { PreflightView } from './preflight';
import { RepairPanel } from './repair';

type Screen = 'list' | 'preflight' | 'exercise';

const appVersionOf = (appId: string) => catalog.apps.find((a) => a.descriptor.id === appId)?.descriptor.version ?? '';

export async function startApp(root: HTMLElement): Promise<void> {
  const effectWarning = h('p', { class: 'banner banner-warn', role: 'status' });
  const effects = browserEffects(document.documentElement, effectWarning);
  const openSettings = () => openEffectSettings(effects);
  const store = await ProgressStore.open();
  const live = h('div', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const listView = h('section', { class: 'list-view' });
  const main = h('main', { id: 'main' });

  let orchestrator: Orchestrator;
  /** 練習用パックの操作ガイド。演習が始まるたびにそのパックのガイドで始め直し、課題一覧へ戻っても表示し続ける */
  const guide = new GuidePanel({ announce: (message) => announce(live, message), finish: () => void showList() });
  const preflightView = new PreflightView({
    begin: () => void beginExercise(),
    retry: () => void orchestrator.retryPreflight(),
    back: () => void showList(),
  });
  /** プレビューと調査パネルで、いま操作している利用者 */
  let viewer: ActorKey = ANONYMOUS;
  const repair = new RepairPanel({
    apply: (defenseId) => applyDefense(defenseId),
    verify: () => verify(),
    reset: () => resetToInitial(),
  });
  const hints = new HintsPanel({
    openHint: (level) => orchestrator.openHint(level),
    viewSolution: () => orchestrator.viewSolution(),
  });
  const debrief = new DebriefPanel({
    answer: (answers) => {
      const correct = orchestrator.answerTransfer(answers);
      announce(live, correct ? '理解の検印を押しました' : 'まだ正解でない設問があります');
    },
    retry: () => {
      const packId = orchestrator.snapshot?.pack.manifest.id;
      if (packId) void begin(() => orchestrator.start(packId));
    },
  });
  const exerciseView = new ExerciseView(
    {
      back: () => void showList(),
      openSettings,
      switchUser: (actor) => {
        guide.reach('user-switched');
        void showViewer(actor);
      },
      reloadView: () => void showViewer(viewer),
      send: (request) => send(request),
    },
    {
      tabs: [
        { id: 'repair', label: '対策', panel: repair.element },
        { id: 'debrief', label: '振り返り', panel: debrief.element },
      ],
      storyFooter: hints.element,
    },
  );
  const exercise = new BrowserRuntimeAdapter({
    container: exerciseView.previewSlot,
    onExchange: (exchange) => observe(exchange),
  });
  orchestrator = new Orchestrator({
    apps: catalog.apps,
    packs: catalog.packs,
    evaluator: new Evaluator(() => new BrowserRuntimeAdapter()),
    exercise,
  });

  fill(
    root,
    h('a', { href: '#main', class: 'skip-link' }, '本文へ移動'),
    h(
      'header',
      { class: 'site-header' },
      h('p', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': true }, '◆'), 'PatchQuest'),
      h('p', { class: 'brand-tagline' }, 'セキュリティの直し方を、壊れても困らない場所で練習する'),
    ),
    effectWarning,
    main,
    live,
  );
  fill(main, guide.element, listView, preflightView.element, exerciseView.element);

  let screen: Screen = 'list';
  function show(next: Screen): void {
    screen = next;
    const snapshot = orchestrator.snapshot;
    if (snapshot && next === 'preflight') preflightView.update(snapshot);
    if (snapshot && next === 'exercise') updateExercise(snapshot);
    listView.hidden = next !== 'list';
    preflightView.element.hidden = next !== 'preflight';
    exerciseView.element.hidden = next !== 'exercise';
    guide.refresh();
    if (next === 'preflight') preflightView.focus();
    if (next === 'exercise') exerciseView.focus();
  }


  // 状態が変わるたびに画面を更新し、まとまった変更ごとに保存する
  let saveScheduled = false;
  orchestrator.subscribe((snapshot: ExerciseSnapshot) => {
    const { attempt } = snapshot;
    if (screen === 'preflight') preflightView.update(snapshot);
    if (screen === 'exercise') updateExercise(snapshot);
    guide.sync(snapshot);
    if (!attempt.fixtureHash || saveScheduled) return;
    saveScheduled = true;
    queueMicrotask(() => {
      saveScheduled = false;
      void store.save(structuredClone(attempt));
    });
  });

  async function entries(): Promise<MissionEntry[]> {
    const records = await store.list();
    const live = orchestrator.snapshot;
    return catalog.packs.map((pack) => {
      const latest = records.filter((r) => r.missionId === pack.manifest.id).at(-1);
      const resumable = !!latest && latest.missionVersion === pack.manifest.version && satisfies(appVersionOf(latest.appId), pack.manifest.appCompatibility.versions);
      // 防御が現在の合格なのは、この画面で検証した演習だけ。保存した記録は再検証するまで確定しない
      const defenseCurrent = !!latest && live?.attempt.attemptId === latest.attemptId && live.defenseCurrent;
      return { pack, latest, resumable, defenseCurrent };
    });
  }

  async function showList(message?: string): Promise<void> {
    await exercise.stop();
    fill(
      listView,
      missionList(await entries(), store.unavailableReason, {
        openSettings,
        start: (packId) => void begin(() => orchestrator.start(packId)),
        resume: (record) => void begin(() => orchestrator.start(record.missionId, { resume: record })),
        exportProgress: () => void exportProgress(),
        importProgress: (file) => void importProgress(file),
        clearProgress: () => void clearProgress(),
      }),
    );
    show('list');
    if (message) announce(live, message);
    listView.querySelector<HTMLElement>('h1')?.focus();
  }

  async function begin(run: () => Promise<ExerciseSnapshot>): Promise<void> {
    show('preflight');
    announce(live, '開始前チェックを始めました');
    const snapshot = await run();
    announce(live, isInExercise(snapshot.attempt.state) ? '開始前チェックが終わりました。演習を始められます' : '開始前チェックで問題が見つかりました');
  }

  function updateExercise(snapshot: ExerciseSnapshot): void {
    exerciseView.update(snapshot);
    repair.update(snapshot);
    hints.update(snapshot);
    debrief.update(snapshot);
  }

  async function applyDefense(defenseId: string | null): Promise<void> {
    await orchestrator.applyDefense(defenseId);
    announce(live, defenseId ? '対策を適用しました。検証して確かめましょう' : '対策を取り消しました');
  }

  async function verify(): Promise<void> {
    announce(live, '検証を始めました');
    const report = await orchestrator.verify();
    const snapshot = orchestrator.snapshot;
    repair.focusResults();
    if (!report) announce(live, '実行環境のエラーで検証できませんでした（不合格には数えません）');
    else if (report.passed) announce(live, snapshot?.attempt.state === 'Passed' ? '防御できました。すべての検印がそろいました' : '防御できました。防御の検印を押しました');
    else announce(live, '検証が終わりました。まだ合格ではありません');
  }

  async function resetToInitial(): Promise<void> {
    const ok = await confirmDialog({
      title: '初期状態へ戻しますか？',
      body: 'この演習で適用した対策を外し、データも演習開始時の状態へ戻します。達成印と観測ログは残ります。',
      confirm: '初期状態へ戻す',
      danger: true,
    });
    if (!ok) return;
    await orchestrator.resetToInitial();
    guide.reach('reset');
    sessions.clear();
    await showViewer(viewer);
    announce(live, '初期状態へ戻しました');
  }

  const currentApp = () => catalog.apps.find((a) => a.descriptor.id === orchestrator.snapshot?.attempt.appId);

  /** 観測したやり取りを進行（再現の判定）と観測ログへ渡す。画面の表示だけのやり取りは事象があるときだけ記録する */
  function observe(exchange: Exchange): void {
    const reproduced = orchestrator.onExchange(exchange);
    if (exchange.kind === 'request' || exchange.events.length > 0) exerciseView.investigation.record(exchange, exerciseView.label(exchange.actor));
    if (reproduced) announce(live, '再現の検印を押しました。事故を自分の操作で再現できました');
  }

  /** 信頼された演習ハーネスとして、表示する利用者を切り替えて最初の画面を開く */
  async function showViewer(actor: ActorKey): Promise<void> {
    const app = currentApp();
    if (!app) return;
    viewer = actor;
    exerciseView.setViewer(actor);
    try {
      await exercise.showView(actor, app.descriptor.entryRoute, orchestrator.newRunId());
      announce(live, `${exerciseView.label(actor)} として表示しています`);
    } catch (e) {
      announce(live, `画面を表示できませんでした：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function beginExercise(): Promise<void> {
    const snapshot = orchestrator.snapshot;
    const app = currentApp();
    if (!snapshot || !app) return;
    viewer = app.descriptor.users[0] ?? ANONYMOUS;
    sessions.clear();
    exerciseView.setup(snapshot, app.descriptor, viewer, (event) => app.describeEvent?.(event) ?? null);
    repair.setup(snapshot);
    show('exercise');
    guide.reach('started');
    await showViewer(viewer);
  }

  /** 利用者ごとのセッション。演習を始めるたびに発行し直す */
  const sessions = new Map<ActorKey, SessionToken | null>();
  async function sessionFor(actor: ActorKey, runId: string): Promise<SessionToken | null> {
    if (!sessions.has(actor)) sessions.set(actor, (await exercise.invoke({ kind: 'session', actor }, { runId })).session ?? null);
    return sessions.get(actor)!;
  }

  /** 現在の利用者として、ブラウザ内の呼び出しを送る。基盤エラーは理由を返し、不合格には数えない */
  async function send(request: AppRequest): Promise<string | null> {
    const runId = orchestrator.newRunId();
    try {
      const session = await sessionFor(viewer, runId);
      const { response, events } = await exercise.invoke({ kind: 'request', session, request }, { runId });
      observe({ runId, actor: viewer, kind: 'request', request, response, events });
      guide.reach('request-sent');
      return null;
    } catch (e) {
      if (e instanceof RuntimeError && e.code === 'input-too-large') return '入力が大きすぎます（1 件 4KB まで）。内容を短くしてください。';
      if (e instanceof RuntimeError) return `実行環境のエラーで送れませんでした（不合格には数えません）：${e.message}`;
      throw e;
    }
  }

  async function exportProgress(): Promise<void> {
    const blob = new Blob([await store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: `patchquest-progress-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    announce(live, '進捗を書き出しました');
    guide.reach('exported');
  }

  async function importProgress(file: File): Promise<void> {
    const result = await store.importJson(await file.text());
    await showList(result.ok ? `進捗を ${result.imported} 件読み込みました` : `進捗を読み込めませんでした：${result.error}`);
    if (!result.ok) {
      const banner = h('p', { class: 'banner banner-error', role: 'alert' }, `進捗を読み込めませんでした。今の進捗はそのままです。（${result.error}）`);
      listView.querySelector('.progress-tools')?.append(banner);
    }
  }

  async function clearProgress(): Promise<void> {
    const ok = await confirmDialog({
      title: '進捗をすべて削除しますか？',
      body: 'このブラウザに保存した達成印と記録がすべて消えます。必要なら先に書き出してください。',
      confirm: '削除する',
      danger: true,
    });
    if (!ok) return;
    await store.clear();
    await showList('進捗を削除しました');
  }

  await showList();
}
