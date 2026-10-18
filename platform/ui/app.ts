// 学習UIの組み立て。課題一覧・記録・開始前チェック・演習画面を切り替え、進行（Orchestrator）と保存（ProgressStore）をつなぐ
import { catalog } from '@catalog';
import { ANONYMOUS, RuntimeError, isInExercise, type ActorKey, type AppRequest, type AttemptRecord, type Exchange, type SessionToken } from '../contract';
import { Evaluator } from '../evaluator/evaluator';
import { Orchestrator, type ExerciseSnapshot } from '../orchestrator/orchestrator';
import { profileFromAttempts } from '../progress/profile';
import { profileOptions } from './profile-options';
import { ProgressStore } from '../progress/store';
import { BrowserRuntimeAdapter } from '../../runtimes/browser/adapter';
import { browserEffects } from './browser-effects';
import { openEffectSettings } from './effect-settings-panel';
import { confirmDialog } from './components';
import { announce, fill, h } from './dom';
import { DebriefPanel, HintsPanel } from './debrief';
import { ExerciseView } from './exercise';
import { GuidePanel } from './guide';
import { missionList } from './mission-list';
import { missionEntries } from './mission-entries';
import { hasCompleted } from './mission-table';
import { habitSections } from './habits';
import { recordsPage } from './records';
import { siteNav } from './site-nav';
import { reviewCandidates } from '../progress/review';
import { planChallenge, type ChallengePlan } from '../progress/challenge';
import { progressActions } from './progress-actions';
import { PreflightView } from './preflight';
import { RepairPanel } from './repair';
import { ResultEffects } from './result-effects';
import { verificationEffect } from './result-effect-model';
import { serialLatest } from './serial';

type Screen = 'list' | 'records' | 'preflight' | 'exercise';


export async function startApp(root: HTMLElement): Promise<void> {
  const effectWarning = h('p', { class: 'banner banner-warn', role: 'status' });
  const effects = browserEffects(document.documentElement, effectWarning);
  const openSettings = () => openEffectSettings(effects);
  const store = await ProgressStore.open(profileOptions);
  const live = h('div', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const resultEffects = new ResultEffects(effects, (message) => announce(live, message));
  const listView = h('section', { class: 'list-view' }), recordsView = h('section', { class: 'records-view' }), main = h('main', { id: 'main' });
  const nav = siteNav((page) => void (page === 'list' ? showList() : showRecords()));

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
    retry: () => withCurrentPack((packId) => begin(packId)),
    challenge: () => withCurrentPack((packId) => challenge(packId)),
  });
  function withCurrentPack(run: (packId: string) => Promise<void>): void {
    const packId = orchestrator.snapshot?.pack.manifest.id;
    if (packId) void run(packId);
  }
  const exerciseView = new ExerciseView(
    {
      back: () => void showList(),
      openSettings,
      briefed: () => {
        orchestrator.markBriefed();
        guide.reach('briefed');
      },
      switchUser: (actor) => {
        guide.reach('user-switched');
        // 描画開始前に閲覧者を確定する。送信後の描き直しは、この時点の閲覧者で行う
        viewer = actor;
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
      callout: resultEffects.element,
    },
    (message) => announce(live, message),
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

  let screen: Screen = 'list';
  fill(
    root,
    h('a', { href: '#main', class: 'skip-link' }, '本文へ移動'),
    h(
      'header',
      { class: 'site-header' },
      // どの画面からでも課題一覧へ戻す。一覧のときは描き直さない。検証中も「課題一覧へ戻る」と同じ showList を使う
      h('button', {
        type: 'button', class: 'brand', 'aria-label': 'PatchQuest（課題一覧へ戻る）',
        on: { click: () => { if (screen !== 'list') void showList(); } },
      }, h('img', { class: 'brand-mark', src: './assets/brand/mark.svg', alt: '' }), 'PatchQuest'),
      nav.element,
    ),
    effectWarning,
    main,
    live,
  );
  fill(main, guide.element, listView, recordsView, preflightView.element, exerciseView.element);

  let others: AttemptRecord[] = [];
  function show(next: Screen): void {
    screen = next;
    const snapshot = orchestrator.snapshot;
    if (snapshot && next === 'preflight') preflightView.update(snapshot);
    if (snapshot && next === 'exercise') updateExercise(snapshot);
    listView.hidden = next !== 'list';
    recordsView.hidden = next !== 'records';
    nav.select(next === 'list' || next === 'records' ? next : null);
    preflightView.element.hidden = next !== 'preflight';
    exerciseView.element.hidden = next !== 'exercise';
    guide.refresh();
    if (next === 'preflight') preflightView.focus();
    if (next === 'exercise') exerciseView.focus();
  }

  // 状態が変わるたびに画面を更新し、まとまった変更ごとに保存する
  let saveScheduled = false;
  let saved = Promise.resolve();
  orchestrator.subscribe((snapshot: ExerciseSnapshot) => {
    const { attempt } = snapshot;
    if (screen === 'preflight') preflightView.update(snapshot);
    if (screen === 'exercise') updateExercise(snapshot);
    guide.sync(snapshot);
    if (!attempt.fixtureHash || saveScheduled) return;
    saveScheduled = true;
    queueMicrotask(() => {
      saveScheduled = false;
      const record = structuredClone(attempt);
      // 保存先の失敗理由は withBackend が unavailableReason に残す。次の保存と一覧表示は止めない。
      saved = saved.then(() => store.save(record)).catch(() => undefined);
    });
  });

  /** 演習を止め、保存を待ってから、保存済みの記録と演習をまたぐ記録を読む（一覧と記録ページの共通の下準備） */
  async function loadRecords() {
    await exercise.stop();
    await saved;
    const records = await store.list();
    return { records, profile: await store.profile(records) };
  }

  async function showList(message?: string): Promise<void> {
    const { records, profile } = await loadRecords();
    fill(
      listView,
      missionList(missionEntries(records, orchestrator.snapshot), {
        openSettings,
        openRecords: () => void showRecords(),
        start: (packId) => void begin(packId),
        resume: (record) => void begin(record.missionId, record),
        challenge: (packId) => void challenge(packId),
      }, { mastery: profile.mastery, reviewAvailable: reviewCandidates(catalog.packs, records).length > 0, storageWarning: store.unavailableReason }),
    );
    show('list');
    if (message) announce(live, message);
    listView.querySelector<HTMLElement>('h1')?.focus();
  }

  async function showRecords(message?: string): Promise<void> {
    const { records, profile } = await loadRecords();
    const habits = habitSections({ packs: catalog.packs, records, profile, store, refresh: (text) => void showRecords(text) });
    fill(recordsView, recordsPage(profile, catalog.packs, habits, store.unavailableReason, progress));
    show('records');
    if (message) announce(live, message);
    recordsView.querySelector<HTMLElement>('h1')?.focus();
  }

  /** 導入を見せる演習の ID。同じ課題の記録（今回の演習を除く）が保存済みなら見せない */
  let briefingAttemptId: string | null = null;
  async function begin(packId: string, resume?: AttemptRecord, plan?: ChallengePlan): Promise<void> {
    others = [];
    // start は最初の await より前に新しい演習の状態を公開するので、先に呼んでから画面を切り替える（前の演習の「演習を始める」を残さない）
    const started = orchestrator.start(packId, { resume, ...plan });
    show('preflight');
    announce(live, '開始前チェックを始めました');
    const [records, snapshot] = await Promise.all([saved.then(() => store.list()), started]);
    others = records.filter((record) => record.attemptId !== snapshot.attempt.attemptId);
    const seen = records.some((record) => record.missionId === packId && record.attemptId !== snapshot.attempt.attemptId);
    briefingAttemptId = !resume && (!!store.unavailableReason || !seen) ? snapshot.attempt.attemptId : null;
    announce(live, isInExercise(snapshot.attempt.state) ? '開始前チェックが終わりました。演習を始められます' : '開始前チェックで問題が見つかりました');
  }

  /** 完了済みの課題を別条件で解き直す。条件は保存済みの記録から決め、同じ seed は使わない */
  async function challenge(packId: string): Promise<void> {
    const pack = catalog.packs.find((candidate) => candidate.manifest.id === packId);
    if (!pack) throw new Error(`課題 ${packId} は登録されていません`);
    await saved;
    await begin(packId, undefined, planChallenge(pack, await store.list()));
  }

  function updateExercise(snapshot: ExerciseSnapshot): void {
    exerciseView.update(snapshot);
    const profile = profileFromAttempts([...others, snapshot.attempt], profileOptions);
    exerciseView.xp.update(profile.xp);
    exerciseView.achievements.update(profile.achievements);
    resultEffects.update(snapshot);
    repair.update(snapshot);
    hints.update(snapshot);
    debrief.update(snapshot, profile.mastery, hasCompleted([...others, snapshot.attempt].filter((record) => record.missionId === snapshot.attempt.missionId)));
  }

  async function applyDefense(defenseId: string | null): Promise<void> {
    // 同じ対策の再適用や、脆弱な状態での取り消しでは演習の状態が変わらないので、ここで消す
    resultEffects.clear();
    await orchestrator.applyDefense(defenseId);
    announce(live, defenseId ? '対策を適用しました。検証して確かめましょう' : '対策を取り消しました');
  }

  async function verify(): Promise<void> {
    announce(live, '検証を始めました');
    const report = await orchestrator.verify();
    const effect = verificationEffect(report, orchestrator.snapshot?.attempt.state === 'Passed');
    if (effect) resultEffects.show(effect);
    repair.focusResults();
    if (!report) announce(live, '実行環境のエラーで検証できませんでした（不合格には数えません）');
    else if (!effect) announce(live, '実行環境のエラーで判定できませんでした（不合格には数えません）');
  }

  async function resetToInitial(): Promise<void> {
    const ok = await confirmDialog({
      title: '初期状態へ戻しますか？',
      body: 'この演習で適用した対策を外し、データも演習開始時の状態へ戻します。達成印と観測ログは残ります。',
      confirm: '初期状態へ戻す',
      danger: true,
    });
    if (!ok) return;
    resultEffects.clear();
    await orchestrator.resetToInitial();
    guide.reach('reset');
    sessions.clear();
    await showViewer(viewer);
    announce(live, '初期状態へ戻しました');
  }

  // 初期表示の自動要求と、その後の利用者操作は同じ実行 ID を使うので、読み込み中かどうかで区別する。
  const openingViews = new Set<string>();
  const currentApp = () => catalog.apps.find((a) => a.descriptor.id === orchestrator.snapshot?.attempt.appId);

  /** 観測したやり取りを進行（再現の判定）と観測ログへ渡す。画面の表示だけのやり取りは事象があるときだけ記録する */
  function observe(exchange: Exchange): void {
    const reproduced = orchestrator.onExchange(exchange, { initialView: openingViews.has(exchange.runId) });
    if (exchange.kind === 'request' || exchange.events.length > 0) exerciseView.investigation.record(exchange, exerciseView.label(exchange.actor));
    if (reproduced) resultEffects.show({ kind: 'reproduced', detail: '再現の検印を押しました。事故を自分の操作で再現できました。' });
  }

  // 初期表示と利用者切り替えが同時に走ると描画要求がフレームへ逆順に届き、古い画面が後から上書きしうる。直列化して要求順に描画する
  // 送信後の描き直しでは閲覧者は変わらないので読み上げない。読み上げると、送信で届いた XP や到達の通知を上書きしてしまう
  const renderView = serialLatest(async ({ actor, announceViewer }: { actor: ActorKey; announceViewer: boolean }): Promise<void> => {
    const app = currentApp();
    if (!app) return;
    viewer = actor;
    exerciseView.setViewer(actor);
    const runId = orchestrator.newRunId();
    openingViews.add(runId);
    try {
      await exercise.showView(actor, app.descriptor.entryRoute, runId);
      if (announceViewer) announce(live, `${exerciseView.label(actor)} として表示しています`);
    } catch (e) {
      announce(live, `画面を表示できませんでした：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      openingViews.delete(runId);
    }
  });
  const showViewer = (actor: ActorKey): Promise<void> => renderView({ actor, announceViewer: true });

  async function beginExercise(): Promise<void> {
    const snapshot = orchestrator.snapshot;
    const app = currentApp();
    if (!snapshot || !app) return;
    viewer = app.descriptor.users[0] ?? ANONYMOUS;
    sessions.clear();
    // 続きから始めると attemptId・configHash・検証結果が前回と同じなので、前回のコールアウトは明示的に消す
    resultEffects.clear();
    const showBriefing = snapshot.attempt.attemptId === briefingAttemptId;
    exerciseView.setup(snapshot, app.descriptor, viewer, (event) => app.describeEvent?.(event) ?? null, showBriefing);
    repair.setup(snapshot);
    if (!showBriefing) orchestrator.markBriefed();
    show('exercise');
    // 既定で飛ばすときは 2 つの出来事をまとめて知らせ、読み上げを 1 回にする
    if (!showBriefing) guide.reach('started', 'briefed');
    else guide.reach('started');
    await showViewer(viewer);
  }

  /** 利用者ごとのセッション。演習を始めるたびに発行し直す */
  const sessions = new Map<ActorKey, SessionToken | null>();
  async function sessionFor(actor: ActorKey, runId: string): Promise<SessionToken | null> {
    if (!sessions.has(actor)) sessions.set(actor, (await exercise.invoke({ kind: 'session', actor }, { runId })).session ?? null);
    return sessions.get(actor)!;
  }

  /** 現在の利用者として、ブラウザ内の呼び出しを送る。基盤エラーは理由を返し、不合格には数えない。
   * 送り終わったら、実行環境のエラーで送れなかったときも含めて、今の閲覧者で最初の画面を描き直す */
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
    } finally {
      await renderView({ actor: viewer, announceViewer: false });
    }
  }

  const progress = progressActions({ store, view: recordsView, guide, refresh: showRecords, announce: (message) => announce(live, message) });

  await showList();
}
