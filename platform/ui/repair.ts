// 対策パネルと検証結果（spec §10）。修正方針を選ぶとその場で適用し（取り消しもできる）、参考コード差分を閲覧し、
// 攻撃阻止・正常系・回帰を検証する。合否は実際の実行結果だけで決まり、選んだ対策の ID では決まらない
import { RESULT_GROUPS, failedOutcomes, nextExerciseState, type AttemptRecord, type DefenseDef, type ReferenceDiff, type RepairDef, type TestOutcome, type VerificationReport } from '../contract';
import { highlightSource } from '../syntax/highlight';
import { isCurrent } from '../evaluator/evaluator';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { securityComparison } from './security-comparison';
import { verdictKind, whyDefenseFailed } from './verdict';
import { approachNodes, expectedActual, radioOption, status } from './components';
import { fill, h, renderGuard } from './dom';
import { headingWithInfo } from './info-popover';
import { describersOf, type DescribingApp } from './investigation';
import { GROUP_LABEL, STALE_VERIFICATION, VERDICT_REASON, VERDICT_SUCCESS, VERDICT_TITLE } from './labels';
import { failureDetails } from './result-effect-model';
import { recordSection, recordedChanges, recordedSummary, type RequestDescriber } from './repair-record';

export interface RepairActions {
  apply(defenseId: string | null): Promise<void>;
  verify(): Promise<void>;
  reset(): Promise<void>;
}

/** 検証結果の総評。記号と言葉で示す */
function verdict(report: VerificationReport): HTMLElement {
  const kind = verdictKind(report);
  if (kind === 'secured') return h('div', { class: 'banner banner-ok' }, status('passed', VERDICT_TITLE.secured), ` ${VERDICT_SUCCESS}`);
  if (kind === 'undetermined') {
    return h('div', { class: 'banner banner-warn' }, status('error', '判定できませんでした'), ' システムのエラーです。不合格には数えません。もう一度テストしてください。');
  }
  const groups = new Set(failedOutcomes(report).map((outcome) => outcome.group));
  const reasons = RESULT_GROUPS.filter((group) => groups.has(group)).map((group) => VERDICT_REASON[group]);
  return h('div', { class: 'banner banner-error' }, status('failed', VERDICT_TITLE.insufficient), ` ${reasons.join('。')}。`);
}

const OUTCOME_TEXT = { error: '判定不可', passed: '合格', failed: '不合格' } as const;

function outcomeKind(outcome: TestOutcome): keyof typeof OUTCOME_TEXT {
  if (outcome.error) return 'error';
  if (outcome.passed) return 'passed';
  return 'failed';
}

function outcomeItem(outcome: TestOutcome): HTMLElement {
  const kind = outcomeKind(outcome);
  const text = OUTCOME_TEXT[kind];
  return h(
    'li',
    { class: 'outcome' },
    h('div', { class: 'outcome-head' }, status(kind, text), h('span', {}, outcome.title)),
    expectedActual(outcome.expected, outcome.actual),
  );
}

function outcomeGroups(report: VerificationReport, stale: boolean): HTMLElement[] {
  return RESULT_GROUPS.flatMap((group) => {
    const items = report.outcomes.filter((outcome) => outcome.group === group);
    if (items.length === 0) return [];
    const passed = items.filter((outcome) => outcome.passed).length;
    const heading = `${GROUP_LABEL[group]}（${passed}/${items.length} 件合格）`;
    return [h('section', { class: 'result-group', 'data-reveal': report.passed && !stale }, h('h4', {}, heading), h('ul', { class: 'outcomes' }, ...items.map(outcomeItem)))];
  });
}

/** 各テストの期待と実測。初めは閉じ、結論の行だけを先に見せる */
function resultDetails(report: VerificationReport, stale: boolean): HTMLElement {
  return h('details', { class: 'verify-details' }, h('summary', { role: 'button' }, '詳しく見る'), ...outcomeGroups(report, stale));
}

/** 不合格のテストを先頭二件まで、1 件ずつ分け、理由と題名・正しい結果・実際の結果を行を分けて示す。残りの件数は添える（全件は「詳しく見る」にある） */
function failureList(report: VerificationReport): HTMLElement[] {
  const { failures, more } = failureDetails(report);
  const items = failures.map((failure) => h('li', {}, h('p', { class: 'verdict-failure-title' }, `${failure.reason}：${failure.title}`), expectedActual(failure.expected, failure.actual)));
  return [h('ul', { class: 'verdict-failures' }, ...items), ...(more > 0 ? [h('p', { class: 'muted' }, `ほか ${more} 件`)] : [])];
}

/** 不合格のときは、総評の直後に失敗したテストと、対策の選び直しへ戻るボタン（rechoose）を置く。選び直す対策がない課題では null を渡す */
function resultNodes(report: VerificationReport, stale: boolean, whyItFailed: string | null, rechoose: HTMLElement | null): (HTMLElement | null)[] {
  const insufficient = verdictKind(report) === 'insufficient';
  return [
    stale ? h('p', { class: 'banner banner-warn' }, STALE_VERIFICATION) : null,
    verdict(report),
    ...(insufficient ? failureList(report) : []),
    insufficient ? rechoose : null,
    securityComparison(report, whyItFailed),
    resultDetails(report, stale),
  ];
}

type DiffPane = 'diff-before' | 'diff-after';

function codePane(pane: DiffPane, caption: string, source: string, language: ReferenceDiff['language']): HTMLElement {
  const body = highlightSource(language, source).map((token) =>
    token.kind === 'text' ? token.text : h('span', { class: `code-token code-token-${token.kind}` }, token.text),
  );
  return h('figure', {}, h('figcaption', {}, caption), h('pre', { class: `mono ${pane}` }, h('code', {}, ...body)));
}


export class RepairPanel {
  readonly element: HTMLElement;
  private readonly choices = h('div', { class: 'defense-choices', role: 'radiogroup', 'aria-labelledby': 'defense-title' });
  private readonly applied = h('p', { class: 'applied' });
  private readonly diff = h('div', { class: 'diff' });
  /** 初めは閉じる。開いた参考コードの下に検証を置くと、パネル内をスクロールしないと押せない */
  private readonly reference = h('details', { class: 'reference-code' }, h('summary', { role: 'button' }, '参考コードを見る'), this.diff);
  private readonly verifyButton = h(
    'button',
    { type: 'button', class: 'button button-primary', 'data-anchor': 'verify', on: { click: () => void this.actions.verify() } },
    '攻撃とふだんの使い方をテストする',
  );
  private readonly verifyNote = h('p', { class: 'note', hidden: true });
  /** 検証中は押せない操作 */
  private readonly revertButton = h('button', { type: 'button', class: 'button button-quiet', on: { click: () => void this.actions.apply(null) } }, '対策を外す');
  private readonly resetButton = h('button', { type: 'button', class: 'button button-danger', on: { click: () => void this.actions.reset() } }, '最初の状態に戻す');
  private readonly rechooseButton = h('button', { type: 'button', class: 'button', on: { click: () => this.returnToChoices() } }, '① に戻って対策を選び直す');
  private readonly results = h('div', { class: 'results' });
  private readonly resultsTitle = h('h3', { tabIndex: -1 }, 'テストの結果');
  /** テストの結果の区画。結果が出るまでは出さない */
  private readonly resultsSection = h('section', { class: 'tool-section', 'data-anchor': 'results', hidden: true }, this.resultsTitle, this.results);
  private readonly resultsGuard = renderGuard();
  /** パックが操作のしかたを持つときだけ、① より先に見せる */
  private readonly guide = h('section', { class: 'tool-section repair-guide', 'aria-labelledby': 'repair-guide-title', hidden: true });
  /** ① の区画。対策を選ぶ課題では候補、操作で直す課題では加えた変更の一覧を置く */
  private readonly choice = h('section', { class: 'tool-section', 'data-anchor': 'defense-panel' });
  private readonly changes = h('div', {});
  private readonly resetNote = h('p', {});
  private defenses: DefenseDef[] = [];
  /** 選んでいる対策。選ぶとその場で使うので、切り替えを待つ間を除いて appliedId と同じ */
  private selected: string | null = null;
  /** 実際に使っている対策 */
  private appliedId: string | null = null;
  /** 対策の切り替えを待っている間。続けて選ばれても、切り替えを重ねない */
  private applying = false;
  private verifying = false;
  /** 操作で直す課題の修正方式。対策を選ぶ課題では null */
  private record: RepairDef | null = null;
  private describeRequest: RequestDescriber = () => null;

  /** footer は対策タブの末尾に置く要素（ヒントなど） */
  constructor(private readonly actions: RepairActions, footer: HTMLElement) {
    this.element = h('div', { class: 'repair' }, this.guide, this.choice, this.verifySection(), this.resetSection(), footer);
  }

  /** 演習を始めたときに、修正の方式に合わせて ① の区画を組み直す。教材アプリによるリクエストの説明は、加えた変更の表示に使う */
  setup(snapshot: ExerciseSnapshot, app: DescribingApp): void {
    const { manifest } = snapshot.pack;
    this.record = manifest.repair ?? null;
    this.describeRequest = describersOf(app).request;
    this.defenses = manifest.defenses;
    this.appliedId = snapshot.attempt.appliedDefense;
    this.selected = this.appliedId;
    this.reference.open = false;
    this.guide.hidden = !manifest.repairGuide;
    if (manifest.repairGuide) fill(this.guide, ...approachNodes('repair-guide-title', '操作のしかた', manifest.repairGuide));
    fill(this.choice, ...(this.record ? recordSection(this.record, this.changes) : this.choiceNodes()));
    const undone = this.record ? `${this.record.noun}を消し` : '使った対策を外し';
    this.resetNote.textContent = `${undone}、データも最初の状態に戻します。スタンプは残ります。`;
    fill(
      this.choices,
      ...this.defenses.map((defense) =>
        radioOption(
          { name: 'defense', value: defense.id, checked: defense.id === this.selected, className: 'defense-option', onChange: () => void this.choose(defense.id) },
          h('span', { class: 'defense-text' }, h('strong', {}, defense.label), h('span', { class: 'note' }, defense.description)),
        ),
      ),
    );
    this.showDiff();
  }

  update(snapshot: ExerciseSnapshot): void {
    this.showApplied(snapshot.attempt);
    this.showVerifyState(snapshot.attempt.state);
    this.showResults(snapshot);
  }

  /** 検証が終わったら結果へ移る */
  focusResults(): void {
    this.resultsTitle.focus();
    this.resultsTitle.scrollIntoView({ block: 'start' });
  }

  private choiceNodes(): HTMLElement[] {
    return [
      headingWithInfo(h('h3', { id: 'defense-title' }, '① 対策を選ぶ'), h('p', {}, '選ぶと、教材アプリの中身がその対策に切り替わります。')),
      this.choices,
      this.reference,
      h('div', { class: 'actions' }, this.revertButton),
    ];
  }

  private verifySection(): HTMLElement {
    return h(
      'section',
      { class: 'tool-section' },
      headingWithInfo(h('h3', {}, '② テストする'), h('p', {}, '攻撃を防げたか、ふだんの使い方ができるかを、自動で確かめます。')),
      this.applied,
      h('div', { class: 'actions' }, this.verifyButton),
      this.verifyNote,
      this.resultsSection,
    );
  }

  private resetSection(): HTMLElement {
    return h(
      'section',
      { class: 'tool-section', 'data-anchor': 'reset' },
      headingWithInfo(h('h3', {}, 'やり直す'), this.resetNote),
      h('div', { class: 'actions' }, this.resetButton),
    );
  }

  private showApplied(attempt: AttemptRecord): void {
    if (this.record) {
      fill(this.changes, recordedChanges(this.record, attempt.repairLog, this.describeRequest));
      fill(this.applied, recordedSummary(this.record, attempt.repairLog));
      return;
    }
    const applied = this.defenses.find((defense) => defense.id === attempt.appliedDefense);
    this.revertButton.hidden = !applied;
    this.appliedId = applied?.id ?? null;
    // 切り替えを待つ間は、選んだ対策の表示を保つ
    if (!this.applying) this.showSelected(this.appliedId);
    const label = applied ? `使っている対策：${applied.label}` : '対策は使っていません（セキュリティホールが残った状態）';
    fill(this.applied, status('idle', label));
  }

  private showVerifyState(state: ExerciseSnapshot['attempt']['state']): void {
    const verifying = state === 'Verifying';
    const canVerify = nextExerciseState(state, 'verification-started') !== undefined;
    this.verifying = verifying;
    this.syncChoices();
    this.verifyButton.disabled = verifying || !canVerify;
    this.revertButton.disabled = verifying;
    this.resetButton.disabled = verifying;
    this.verifyNote.replaceChildren();
    if (verifying) fill(this.verifyNote, status('running', 'テストしています…'));
    else if (!canVerify) this.verifyNote.textContent = this.record ? '教材アプリで直す操作をすると、テストできます。' : '対策を選ぶと、テストできます。';
    this.verifyNote.hidden = !verifying && canVerify;
  }

  private showResults(snapshot: ExerciseSnapshot): void {
    const { attempt } = snapshot;
    const report = attempt.lastVerification;
    const key = `${attempt.attemptId}|${report?.runId}|${attempt.configHash}|${snapshot.platformError}|${snapshot.vulnerableVerification?.runId}`;
    if (!this.resultsGuard.changed(key)) return;
    this.resultsSection.hidden = !report && !snapshot.platformError;
    if (snapshot.platformError) {
      fill(this.results, h('div', { class: 'banner banner-warn', role: 'alert' }, status('error', 'システムのエラー'), ` ${snapshot.platformError}（不合格には数えません）`));
      return;
    }
    if (!report) return void this.results.replaceChildren();
    // 操作で直す課題には選び直す対策がないので、選び直しのボタンは出さない
    fill(this.results, ...resultNodes(report, !isCurrent(report, attempt.configHash), whyDefenseFailed(snapshot), this.record ? null : this.rechooseButton));
  }

  /** 選んだ対策をその場で使う。切り替えが終わるまでは、ほかの対策を選べない */
  private async choose(id: string): Promise<void> {
    const hadFocus = this.choices.contains(document.activeElement);
    this.applying = true;
    this.showSelected(id);
    try {
      await this.actions.apply(id);
    } finally {
      this.applying = false;
      // 切り替えに失敗したときも、実際に使っている対策の表示へ戻す
      this.showSelected(this.appliedId);
      if (hadFocus) this.choices.querySelector<HTMLInputElement>('input:checked')?.focus();
    }
  }

  /** 選んでいる対策を替え、ラジオボタンと参考コードを合わせる。参考コードは、対策が替わったときだけ組み直す */
  private showSelected(id: string | null): void {
    const changed = this.selected !== id;
    this.selected = id;
    if (changed) this.showDiff();
    this.syncChoices();
  }

  /** ラジオボタンを、選んでいる対策と、選べるかどうかに合わせる */
  private syncChoices(): void {
    for (const input of this.choices.querySelectorAll('input')) {
      input.checked = input.value === this.selected;
      input.disabled = this.applying || this.verifying;
    }
  }

  /** 参考コード差分（閲覧専用）。実際の切り替えは事前に用意した実装で行う */
  private showDiff(): void {
    const defense = this.defenses.find((item) => item.id === this.selected);
    this.reference.hidden = !defense;
    if (!defense) return void this.diff.replaceChildren();
    const { file, before, after, language } = defense.referenceDiff;
    fill(
      this.diff,
      h('h4', {}, `参考コード（見るだけ）：${file}`),
      h(
        'div',
        { class: 'diff-pair' },
        codePane('diff-before', '変更前（いまの状態）', before, language),
        codePane('diff-after', `変更後（${defense.label}）`, after, language),
      ),
    );
  }

  /** 不合格のあと、選んでいる対策のラジオへ戻す */
  private returnToChoices(): void {
    const choice = this.choices.querySelector<HTMLInputElement>('input:checked') ?? this.choices.querySelector<HTMLInputElement>('input');
    if (!choice) return;
    choice.scrollIntoView({ block: 'center' });
    choice.focus({ preventScroll: true });
  }
}
