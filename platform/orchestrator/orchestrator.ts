// 演習の進行を担う（spec §5, §13）。互換性の確認、基準状態の検証、注入、事前検証、
// 演習用インスタンスの準備、対策の切り替え、再検証、リセットを状態遷移表に沿って行う
import {
  RuntimeError,
  canTransition,
  satisfies,
  validatePack,
  type AppDescriptor,
  type AttemptRecord,
  type Exchange,
  type ExerciseState,
  type ImplementationRegistry,
  type ImplementationSelection,
  type MissionPack,
  type RuntimeAdapter,
  type TestCase,
  type VerificationReport,
} from '../contract';
import { Evaluator, configHash, detectReproduction, type EvaluationSubject } from '../evaluator/evaluator';
import type { Scope } from '../evaluator/scenario';

/** カタログに登録された教材アプリのうち、進行に必要な部分 */
export interface CatalogApp {
  descriptor: AppDescriptor;
  tests: TestCase[];
  implementations: ImplementationRegistry;
}

export type PreflightStep = 'compatibility' | 'baseline' | 'inject' | 'prepare';

export interface PreflightEntry {
  step: PreflightStep;
  status: 'running' | 'passed' | 'failed';
  detail: string;
}

/** 開始できない理由。incompatible・injection-failed は開始不可、platform-error は基盤エラー（いずれも不合格に数えない） */
export interface BlockedReason {
  kind: 'incompatible' | 'injection-failed' | 'platform-error';
  message: string;
}

export interface ExerciseSnapshot {
  attempt: AttemptRecord;
  pack: MissionPack;
  /** fixture の値。操作の {{キー}} を展開するのに使う */
  refs: Scope;
  implementations: ImplementationSelection;
  preflight: PreflightEntry[];
  blocked: BlockedReason | null;
  /** 直近の検証で起きた基盤エラー */
  platformError: string | null;
}

export interface OrchestratorDeps {
  apps: CatalogApp[];
  packs: MissionPack[];
  evaluator: Evaluator;
  /** 演習用インスタンス。プレイヤーが操作する画面を持つ */
  exercise: RuntimeAdapter;
  randomSeed?: () => number;
  newId?: () => string;
  now?: () => Date;
}

class Blocked extends Error {
  constructor(readonly reason: BlockedReason) {
    super(reason.message);
  }
}

interface Current {
  snapshot: ExerciseSnapshot;
  app: CatalogApp;
  tests: TestCase[];
  /** 注入後の状態 V の実装 */
  vulnerable: ImplementationSelection;
  /** パックが交換するフックの基準実装 */
  baseline: ImplementationSelection;
  /** 演習用インスタンスに現在設定している実装（パックが交換するフックすべて） */
  applied: ImplementationSelection;
  runCount: number;
}

export class Orchestrator {
  private current: Current | null = null;
  private readonly listeners = new Set<(snapshot: ExerciseSnapshot) => void>();
  private readonly randomSeed: () => number;
  private readonly newId: () => string;
  private readonly now: () => Date;

  constructor(private readonly deps: OrchestratorDeps) {
    this.randomSeed = deps.randomSeed ?? (() => crypto.getRandomValues(new Uint32Array(1))[0]!);
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.now = deps.now ?? (() => new Date());
  }

  get snapshot(): ExerciseSnapshot | null {
    return this.current?.snapshot ?? null;
  }

  subscribe(listener: (snapshot: ExerciseSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 実行 ID を発行する。現在の演習の attemptId を接頭辞にし、古い演習のやり取りと区別する */
  newRunId(kind = 'player'): string {
    const c = this.require();
    return `${c.snapshot.attempt.attemptId}:${kind}:${++c.runCount}`;
  }

  /**
   * 新しい演習を始める。基準状態から作り直し、前の演習の注入・対策・データを引き継がない。
   * 事前検証に合格するまで演習用インスタンスには触れないため、失敗しても部分適用は残らない
   */
  async start(packId: string, options: { variantId?: string; seed?: number } = {}): Promise<ExerciseSnapshot> {
    const pack = this.deps.packs.find((p) => p.manifest.id === packId);
    if (!pack) throw new Error(`課題 ${packId} は登録されていません`);
    const { manifest } = pack;
    const variant = manifest.fixtures.variants.find((v) => v.id === (options.variantId ?? manifest.fixtures.variants[0]?.id));
    const recipe = manifest.mutationRecipes.find((r) => r.id === variant?.recipe);
    const app =
      this.deps.apps.find((a) => a.descriptor.id === manifest.appCompatibility.appId && satisfies(a.descriptor.version, manifest.appCompatibility.versions)) ??
      this.deps.apps.find((a) => a.descriptor.id === manifest.appCompatibility.appId);

    const attempt: AttemptRecord = {
      attemptId: this.newId(),
      missionId: manifest.id,
      missionVersion: manifest.version,
      variantId: variant?.id ?? '',
      recipeId: recipe?.id ?? '',
      recipeVersion: recipe?.version ?? '',
      appId: manifest.appCompatibility.appId,
      appVersion: app?.descriptor.version ?? '',
      seed: options.seed ?? this.randomSeed(),
      fixtureHash: '',
      createdAt: this.now().toISOString(),
      state: 'Selected',
      configHash: '',
      appliedDefense: null,
      badges: { reproduction: { achieved: false }, defense: { achieved: false }, understanding: { achieved: false } },
      lastVerification: null,
      hintsOpened: [],
      solutionViewed: false,
      answers: {},
    };
    const vulnerable = Object.fromEntries((recipe?.apply ?? []).map((c) => [c.hook, c.implementation]));
    const baseline = Object.fromEntries(
      manifest.hooks.map((h) => [h.id, app?.descriptor.hooks.find((d) => d.id === h.id)?.baseline ?? '']),
    );
    this.current = {
      snapshot: { attempt, pack, refs: {}, implementations: {}, preflight: [], blocked: null, platformError: null },
      app: app ?? { descriptor: { id: manifest.appCompatibility.appId, version: '', features: [], hooks: [], users: [] }, tests: [], implementations: {} },
      tests: [...(app?.tests ?? []), ...manifest.tests.cases],
      vulnerable,
      baseline,
      applied: {},
      runCount: 0,
    };
    await this.runPreflight();
    return this.require().snapshot;
  }

  /** 開始不可・基盤エラーの後に、同じ演習の事前検証をやり直す */
  async retryPreflight(): Promise<ExerciseSnapshot> {
    await this.runPreflight();
    return this.require().snapshot;
  }

  /**
   * プレイヤーの操作で観測したやり取りを受け取る。攻撃の成立にあたれば再現の達成印を付ける。
   * 現在の演習の実行 ID でないやり取り（古い演習の応答など）は無視する
   */
  onExchange(exchange: Exchange): void {
    const c = this.current;
    if (!c || !exchange.runId.startsWith(`${c.snapshot.attempt.attemptId}:`)) return;
    const { attempt, pack, refs } = c.snapshot;
    if (!['Prepared', 'Explored', 'Repairing', 'Passed'].includes(attempt.state)) return;
    if (attempt.state === 'Prepared') this.transition('Explored');
    if (!attempt.badges.reproduction.achieved && detectReproduction(exchange, pack.manifest.probes, refs)) {
      attempt.badges.reproduction = { achieved: true, runId: exchange.runId, at: this.now().toISOString() };
    }
    this.emit();
  }

  /** 対策を適用する（null で取り消して脆弱な状態 V に戻す）。動作を切り替えるだけで合否は返さない */
  async applyDefense(defenseId: string | null): Promise<void> {
    const c = this.require();
    const { attempt, pack } = c.snapshot;
    const defense = defenseId === null ? null : pack.manifest.defenses.find((d) => d.id === defenseId);
    if (defense === undefined) throw new Error(`対策 ${defenseId} はありません`);
    if (!['Prepared', 'Explored', 'Repairing', 'Passed'].includes(attempt.state)) throw new Error(`${attempt.state} では対策を適用できません`);

    const next: ImplementationSelection = { ...c.vulnerable };
    for (const change of defense?.apply ?? []) next[change.hook] = change.implementation;
    await this.switchImplementations(next);
    attempt.appliedDefense = defenseId;
    if (attempt.state !== 'Repairing') this.transition('Repairing');
    this.emit();
  }

  /**
   * 現在の構成を検証する。演習開始時の seed と初期データを使い、変更レシピは再適用しない。
   * 攻撃阻止・正常系・回帰がすべて通れば防御の達成印を付ける
   */
  async verify(): Promise<VerificationReport | null> {
    const c = this.require();
    const { attempt } = c.snapshot;
    if (attempt.state !== 'Repairing' && attempt.state !== 'Passed') throw new Error('対策を適用してから検証してください');
    if (attempt.state === 'Passed') this.transition('Repairing');
    this.transition('Verifying');
    c.snapshot.platformError = null;
    this.emit();

    let report: VerificationReport;
    try {
      report = await this.deps.evaluator.runSuite(this.subject(c.snapshot.implementations), c.tests, c.snapshot.pack.manifest.tests.target, this.newRunId('verify'), attempt.configHash);
    } catch (e) {
      // 基盤エラーは学習上の不合格に数えない
      if (this.current !== c) return null;
      c.snapshot.platformError = e instanceof Error ? e.message : String(e);
      this.transition('Repairing');
      this.emit();
      return null;
    }
    if (this.current !== c) return null;
    attempt.lastVerification = report;
    if (report.passed) {
      attempt.badges.defense = { achieved: true, runId: report.runId, configHash: report.configHash, at: this.now().toISOString() };
    }
    this.transition(this.allBadges() ? 'Passed' : 'Repairing');
    this.emit();
    return report;
  }

  /** 理解確認に答える。すべて正解なら理解の達成印を付ける */
  answerTransfer(answers: Record<string, string>): boolean {
    const c = this.require();
    const { attempt, pack } = c.snapshot;
    attempt.answers = { ...answers };
    const correct = pack.manifest.transferCheck.every((q) => q.choices.find((ch) => ch.id === answers[q.id])?.correct === true);
    if (correct && !attempt.badges.understanding.achieved) {
      attempt.badges.understanding = { achieved: true, at: this.now().toISOString() };
    }
    if (this.allBadges() && attempt.state === 'Repairing') this.transition('Passed');
    this.emit();
    return correct;
  }

  /** ヒントを開いたことを記録する。減点はしない */
  openHint(level: 1 | 2 | 3): void {
    const { attempt } = this.require().snapshot;
    if (!attempt.hintsOpened.includes(level)) attempt.hintsOpened = [...attempt.hintsOpened, level].sort() as (1 | 2 | 3)[];
    this.emit();
  }

  viewSolution(): void {
    this.require().snapshot.attempt.solutionViewed = true;
    this.emit();
  }

  /** 当該演習の修正を破棄し、同じ seed の脆弱な初期状態へ戻す。達成印は残す */
  async resetToInitial(): Promise<void> {
    const c = this.require();
    const { attempt } = c.snapshot;
    if (!['Explored', 'Repairing', 'Passed'].includes(attempt.state)) return;
    await this.switchImplementations({ ...c.vulnerable });
    await this.deps.exercise.reset();
    attempt.appliedDefense = null;
    this.transition('Prepared');
    this.emit();
  }

  private async runPreflight(): Promise<void> {
    const c = this.require();
    const { snapshot } = c;
    const { attempt, pack } = snapshot;
    snapshot.preflight = [];
    snapshot.blocked = null;
    snapshot.platformError = null;
    this.transition('Preflight');
    this.emit();

    try {
      await this.step('compatibility', async () => {
        const errors = validatePack(pack, {
          app: c.app.descriptor,
          appTestIds: c.app.tests.map((t) => t.id),
          sharedImplementations: c.app.implementations,
        });
        const missing = pack.manifest.runtime.capabilities.filter((cap) => !this.deps.exercise.capabilities.includes(cap));
        if (missing.length) errors.push(`実行環境に必要な機能がありません: ${missing.join(', ')}`);
        if (!attempt.recipeId) errors.push('開始条件（バリエーション）に対応するレシピがありません');
        if (errors.length) throw new Blocked({ kind: 'incompatible', message: errors.join('\n') });
        return `${c.app.descriptor.id}@${c.app.descriptor.version} とパック ${pack.manifest.id}@${pack.manifest.version} は互換`;
      });

      await this.step('baseline', async () => {
        const report = await this.deps.evaluator.runSuite(this.subject({}), c.tests, [], this.newRunId('preflight'), '');
        const failed = report.outcomes.filter((o) => !o.passed);
        if (failed.length) {
          throw new Blocked({ kind: 'platform-error', message: `安全な基準状態で失敗したテストがあります: ${failed.map((o) => o.title).join('、')}` });
        }
        return `基準状態で ${report.outcomes.length} 件のテストがすべて通過`;
      });

      await this.step('inject', async () => {
        const recipe = pack.manifest.mutationRecipes.find((r) => r.id === attempt.recipeId)!;
        const hooks = recipe.apply.map((change) => change.hook);
        if (new Set(hooks).size !== hooks.length) throw new Blocked({ kind: 'injection-failed', message: '同じフックへ二重に注入しようとしています' });

        const subject = this.subject(c.vulnerable);
        const probes = pack.manifest.probes.filter((p) => recipe.verify.probes.includes(p.id));
        const outcomes = await this.deps.evaluator.runProbes(subject, probes, this.newRunId('preflight'));
        const notReached = outcomes.filter((o) => !o.succeeded);
        if (notReached.length) {
          throw new Blocked({ kind: 'injection-failed', message: `注入後に攻撃が成立しませんでした: ${notReached.map((o) => `${o.probeId}（${o.actual}）`).join('、')}` });
        }
        const report = await this.deps.evaluator.runSuite(subject, c.tests, pack.manifest.tests.target, this.newRunId('preflight'), '');
        const broken = report.outcomes.filter((o) => o.group !== 'attack' && !o.passed);
        if (broken.length) {
          throw new Blocked({ kind: 'injection-failed', message: `注入後に正常系・対象外のテストが失敗しました: ${broken.map((o) => o.title).join('、')}` });
        }
        return `攻撃の成立を確認（${outcomes.length} 件）。正常系と対象外のテストは通過`;
      });

      await this.step('prepare', async () => {
        // 事前検証で変わったデータは検証インスタンスに閉じている。演習用は同じ seed の脆弱な初期状態から作る
        const fixture = await this.deps.exercise.prepare({
          attemptId: attempt.attemptId,
          app: { id: c.app.descriptor.id, version: c.app.descriptor.version },
          fixture: { generator: pack.manifest.fixtures.generator, seed: attempt.seed },
          implementations: c.vulnerable,
        });
        await this.deps.exercise.start();
        snapshot.refs = fixture.refs;
        snapshot.implementations = { ...c.vulnerable };
        c.applied = { ...c.baseline, ...c.vulnerable };
        attempt.fixtureHash = fixture.hash;
        attempt.configHash = await this.hashFor(c.vulnerable);
        return '脆弱な初期状態を用意しました';
      });
    } catch (e) {
      if (this.current !== c) return;
      snapshot.blocked =
        e instanceof Blocked ? e.reason : { kind: 'platform-error', message: e instanceof RuntimeError || e instanceof Error ? e.message : String(e) };
      if (!(e instanceof Blocked)) await this.deps.exercise.stop().catch(() => undefined);
      this.transition('Blocked');
      this.emit();
      return;
    }
    if (this.current !== c) return;
    this.transition('Prepared');
    this.emit();
  }

  private async step(step: PreflightStep, work: () => Promise<string>): Promise<void> {
    const { snapshot } = this.require();
    const entry: PreflightEntry = { step, status: 'running', detail: '' };
    snapshot.preflight = [...snapshot.preflight, entry];
    this.emit();
    try {
      entry.detail = await work();
      entry.status = 'passed';
    } catch (e) {
      entry.status = 'failed';
      entry.detail = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this.emit();
    }
  }

  private async switchImplementations(next: ImplementationSelection): Promise<void> {
    const c = this.require();
    // パックが交換するフックを基準実装から組み直し、変わったものだけを設定する。前の対策の実装は残らない
    const full = { ...c.baseline, ...next };
    for (const [hook, implementation] of Object.entries(full)) {
      if (c.applied[hook] !== implementation) await this.deps.exercise.setImplementation(hook, implementation);
    }
    c.applied = full;
    c.snapshot.implementations = { ...next };
    c.snapshot.attempt.configHash = await this.hashFor(next);
  }

  private subject(implementations: ImplementationSelection): EvaluationSubject {
    const c = this.require();
    const { attempt, pack } = c.snapshot;
    return {
      attemptId: attempt.attemptId,
      app: { id: c.app.descriptor.id, version: c.app.descriptor.version },
      fixture: { generator: pack.manifest.fixtures.generator, seed: attempt.seed },
      implementations,
    };
  }

  private hashFor(implementations: ImplementationSelection): Promise<string> {
    const { attempt } = this.require().snapshot;
    return configHash({
      missionId: attempt.missionId,
      missionVersion: attempt.missionVersion,
      recipeId: attempt.recipeId,
      recipeVersion: attempt.recipeVersion,
      app: { id: attempt.appId, version: attempt.appVersion },
      implementations,
    });
  }

  private allBadges(): boolean {
    const { badges } = this.require().snapshot.attempt;
    return badges.reproduction.achieved && badges.defense.achieved && badges.understanding.achieved;
  }

  private transition(to: ExerciseState): void {
    const { attempt } = this.require().snapshot;
    if (attempt.state === to) return;
    if (!canTransition(attempt.state, to)) throw new Error(`状態 ${attempt.state} から ${to} へは遷移できません`);
    attempt.state = to;
  }

  private require(): Current {
    if (!this.current) throw new Error('演習が始まっていません');
    return this.current;
  }

  private emit(): void {
    const snapshot = this.current?.snapshot;
    if (snapshot) for (const listener of this.listeners) listener(snapshot);
  }
}
