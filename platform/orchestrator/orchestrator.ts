// 演習の進行を担う（spec §5, §13）。互換性の確認、基準状態の検証、注入、事前検証、
// 演習用インスタンスの準備、対策の切り替え、再検証、リセットを状態遷移表に沿って行う
import {
  RuntimeError,
  MAX_HISTORY,
  summarizeVerification,
  canTransition,
  isInExercise,
  type AttemptRecord,
  type Exchange,
  type ExerciseState,
  type ImplementationSelection,
  type VerificationReport,
} from '../contract';
import { configHash, detectReproduction } from '../evaluator/evaluator';
import { Blocked, type Current, type ExerciseSnapshot, type OrchestratorDeps, type PreflightEntry, type PreflightStep } from './types';
import { createCurrent } from './start';
import { runPreflightSteps } from './preflight';
import { buildSubject, withChanges } from './subject';

export { compatibleApp, validateForApp } from './types';
export type { CatalogApp, ExerciseSnapshot, PreflightStep } from './types';

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

  /** 実行 ID を発行する。発行した ID のやり取りだけを現在の演習のものとして扱う */
  newRunId(kind = 'player'): string {
    const c = this.require();
    const runId = `${c.snapshot.attempt.attemptId}:${kind}:${c.runIds.size + 1}`;
    c.runIds.add(runId);
    return runId;
  }

  /**
   * 新しい演習を始める。基準状態から作り直し、前の演習の注入・対策・データを引き継がない。
   * 事前検証に合格するまで演習用インスタンスには触れないため、失敗しても部分適用は残らない。
   * resume を渡すと、保存した記録の seed と対策構成から環境を作り直して続きを始める（データは初期化される）
   */
  async start(packId: string, options: { variantId?: string; seed?: number; resume?: AttemptRecord } = {}): Promise<ExerciseSnapshot> {
    const { resume } = options;
    this.current = createCurrent(this.deps, { ...options, packId }, {
      newId: this.newId, now: this.now, randomSeed: this.randomSeed,
    });
    const { manifest } = this.current.snapshot.pack;
    await this.runPreflight();
    const resumedDefense = resume?.appliedDefense;
    if (resumedDefense && this.current?.snapshot.attempt.state === 'Prepared' && manifest.defenses.some((d) => d.id === resumedDefense)) {
      await this.setDefense(resumedDefense);
    }
    return this.require().snapshot;
  }

  /** 導入を閉じた、または既定で飛ばした最初の時刻を記録する。 */
  markBriefed(): void {
    const { milestones } = this.require().snapshot.attempt;
    if (milestones.briefedAt !== null) return;
    milestones.briefedAt = this.now().toISOString();
    this.emit();
  }

  /** 開始不可・基盤エラーの後に、同じ演習の事前検証をやり直す */
  async retryPreflight(): Promise<ExerciseSnapshot> {
    await this.runPreflight();
    return this.require().snapshot;
  }

  /**
   * プレイヤーの操作で観測したやり取りを受け取る。攻撃の成立にあたれば再現の達成印を付け、true を返す。
   * initialView は初期表示の読み込み中の要求。調査の初回記録からだけ除外する。
   * 現在の演習の実行 ID でないやり取り（古い演習の応答など）は無視する
   */
  onExchange(exchange: Exchange, options: { initialView?: boolean } = {}): boolean {
    const c = this.current;
    if (!c?.runIds.has(exchange.runId)) return false;
    const { attempt, pack, refs } = c.snapshot;
    if (!isInExercise(attempt.state)) return false;
    if (!options.initialView && exchange.kind === 'request' && attempt.milestones.firstRequestAt === null) attempt.milestones.firstRequestAt = this.now().toISOString();
    if (attempt.state === 'Prepared') this.transition('Explored');
    const reproduced = !attempt.badges.reproduction.achieved && detectReproduction(exchange, pack.manifest.probes, refs) !== null;
    if (reproduced) attempt.badges.reproduction = { achieved: true, runId: exchange.runId, at: this.now().toISOString() };
    this.emit();
    return reproduced;
  }

  /** 対策を適用する（null で取り消して脆弱な状態 V に戻す）。動作を切り替えるだけで合否は返さない */
  async applyDefense(defenseId: string | null): Promise<void> {
    await this.setDefense(defenseId);
    const { milestones } = this.require().snapshot.attempt;
    if (defenseId !== null && milestones.firstDefenseAt === null) {
      milestones.firstDefenseAt = this.now().toISOString();
      this.emit();
    }
  }

  private async setDefense(defenseId: string | null): Promise<void> {
    const c = this.require();
    const { attempt, pack } = c.snapshot;
    const defense = defenseId === null ? null : pack.manifest.defenses.find((d) => d.id === defenseId);
    if (defense === undefined) throw new Error(`対策 ${defenseId} はありません`);
    if (!isInExercise(attempt.state) || attempt.state === 'Verifying') throw new Error(`${attempt.state} では対策を適用できません`);

    await this.switchImplementations(withChanges(c.vulnerable, defense?.apply ?? []));
    c.snapshot.defenseCurrent = false;
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
    // 長い演習でも保存容量を増やし続けないよう、直近 100 件を保持する。
    const { groups, undetermined } = summarizeVerification(report);
    attempt.history = [...attempt.history, {
      runId: report.runId, at: this.now().toISOString(), defenseId: attempt.appliedDefense,
      passed: report.passed, groups, undetermined,
    }].slice(-MAX_HISTORY);
    if (report.passed) {
      attempt.badges.defense = { achieved: true, runId: report.runId, configHash: report.configHash, at: this.now().toISOString() };
    }
    c.snapshot.defenseCurrent = report.passed;
    this.transition(report.passed && this.allBadges() ? 'Passed' : 'Repairing');
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
    // 検証中は戻せない（検証が終わってから戻す）
    if (!isInExercise(attempt.state) || attempt.state === 'Prepared' || attempt.state === 'Verifying') return;
    await this.switchImplementations({ ...c.vulnerable });
    await this.deps.exercise.reset();
    attempt.appliedDefense = null;
    c.snapshot.defenseCurrent = false;
    this.transition('Prepared');
    this.emit();
  }

  private async runPreflight(): Promise<void> {
    const c = this.require();
    const { snapshot } = c;
    snapshot.preflight = [];
    snapshot.vulnerableVerification = null;
    snapshot.blocked = null;
    snapshot.platformError = null;
    this.transition('Preflight');
    this.emit();

    try {
      await runPreflightSteps({
        current: c, deps: this.deps,
        subject: (implementations) => this.subject(implementations),
        newRunId: () => this.newRunId('preflight'), hashFor: (implementations) => this.hashFor(implementations),
      }, (name, work) => this.step(name, work));
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
    const applied = { ...c.baseline, ...c.snapshot.implementations };
    for (const [hook, implementation] of Object.entries({ ...c.baseline, ...next })) {
      if (applied[hook] !== implementation) await this.deps.exercise.setImplementation(hook, implementation);
    }
    c.snapshot.implementations = { ...next };
    c.snapshot.attempt.configHash = await this.hashFor(next);
  }

  /** 互換性の確認を通った後にだけ呼ぶ（教材アプリがあることは確認済み） */
  private subject(implementations: ImplementationSelection) {
    const c = this.require();
    const { attempt, pack } = c.snapshot;
    return buildSubject(c.app!, pack, attempt.attemptId, attempt.seed, implementations);
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

  /**
   * 再現・防御・理解がそろい、防御は現在の構成で合格していること。
   * 合格後に対策を変えたら、過去の合格を現在の合格として扱わない（spec §5.3）
   */
  private allBadges(): boolean {
    const { attempt, defenseCurrent } = this.require().snapshot;
    return attempt.badges.reproduction.achieved && defenseCurrent && attempt.badges.understanding.achieved;
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
