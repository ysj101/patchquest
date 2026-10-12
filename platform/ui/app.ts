// 学習UIの組み立て。課題一覧・開始前チェック・演習画面を切り替え、進行（Orchestrator）と保存（ProgressStore）をつなぐ
import { catalog } from '@catalog';
import { satisfies } from '../contract';
import { Evaluator } from '../evaluator/evaluator';
import { Orchestrator, type ExerciseSnapshot } from '../orchestrator/orchestrator';
import { ProgressStore } from '../progress/store';
import { BrowserRuntimeAdapter } from '../../runtimes/browser/adapter';
import { confirmDialog } from './components';
import { announce, fill, h } from './dom';
import { ExerciseView } from './exercise';
import { missionList, type MissionEntry } from './mission-list';
import { PreflightView } from './preflight';

type Screen = 'list' | 'preflight' | 'exercise';

const appVersionOf = (appId: string) => catalog.apps.find((a) => a.descriptor.id === appId)?.descriptor.version ?? '';

export async function startApp(root: HTMLElement): Promise<void> {
  const store = await ProgressStore.open();
  const live = h('div', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const listView = h('section', { class: 'list-view' });
  const main = h('main', { id: 'main' });

  let orchestrator: Orchestrator;
  const preflightView = new PreflightView({
    begin: () => show('exercise'),
    retry: () => void orchestrator.retryPreflight(),
    back: () => void showList(),
  });
  const exerciseView = new ExerciseView({ back: () => void showList() });
  const exercise = new BrowserRuntimeAdapter({
    container: exerciseView.previewSlot,
    onExchange: (exchange) => orchestrator.onExchange(exchange),
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
      h('p', { class: 'brand-tagline' }, 'アプリの事故対応を、壊れても困らない場所で練習する'),
    ),
    main,
    live,
  );
  fill(main, listView, preflightView.element, exerciseView.element);

  let screen: Screen = 'list';
  function show(next: Screen): void {
    screen = next;
    const snapshot = orchestrator.snapshot;
    if (snapshot && next === 'preflight') preflightView.update(snapshot);
    if (snapshot && next === 'exercise') exerciseView.update(snapshot);
    listView.hidden = next !== 'list';
    preflightView.element.hidden = next !== 'preflight';
    exerciseView.element.hidden = next !== 'exercise';
    if (next === 'preflight') preflightView.focus();
    if (next === 'exercise') exerciseView.focus();
  }


  // 状態が変わるたびに画面を更新し、まとまった変更ごとに保存する
  let saveScheduled = false;
  orchestrator.subscribe((snapshot: ExerciseSnapshot) => {
    const { attempt } = snapshot;
    if (screen === 'preflight') preflightView.update(snapshot);
    if (screen === 'exercise') exerciseView.update(snapshot);
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
    announce(live, snapshot.attempt.state === 'Prepared' ? '開始前チェックが終わりました。演習を始められます' : '開始前チェックで問題が見つかりました');
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
