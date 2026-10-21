// 対策パネルと検証結果（spec §10）。修正方針を選んで適用・取り消しし、参考コード差分を閲覧し、
// 攻撃阻止・正常系・回帰を検証する。合否は実際の実行結果だけで決まり、選んだ対策の ID では決まらない
import { RESULT_GROUPS, type DefenseDef, type ReferenceDiff, type TestOutcome, type VerificationReport } from '../contract';
import { highlightSource } from '../syntax/highlight';
import { isCurrent } from '../evaluator/evaluator';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { securityComparison } from './security-comparison';
import { failedOutcomes, verdictKind } from './verdict';
import { radioOption, status } from './components';
import { fill, h, renderGuard } from './dom';
import { GROUP_LABEL, STALE_VERIFICATION, VERDICT_REASON, VERDICT_SUCCESS, VERDICT_TITLE } from './labels';

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
    return h('div', { class: 'banner banner-warn' }, status('error', '判定できませんでした'), ' 実行環境のエラーです。不合格には数えません。もう一度検証してください。');
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
    h('dl', { class: 'outcome-detail' }, h('dt', {}, '期待'), h('dd', { class: 'mono' }, outcome.expected), h('dt', {}, '実測'), h('dd', { class: 'mono' }, outcome.actual)),
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

function resultNodes(report: VerificationReport, stale: boolean): HTMLElement[] {
  return [stale ? h('p', { class: 'banner banner-warn' }, STALE_VERIFICATION) : null, verdict(report), securityComparison(report), resultDetails(report, stale)].filter((node): node is HTMLElement => node !== null);
}

type DiffPane = 'diff-before' | 'diff-after';

function codePane(pane: DiffPane, caption: string, source: string, language: ReferenceDiff['language']): HTMLElement {
  const body = highlightSource(language, source).map((token) =>
    token.kind === 'text' ? token.text : h('span', { class: `code-token code-token-${token.kind}` }, token.text),
  );
  return h('figure', {}, h('figcaption', {}, caption), h('pre', { class: `mono ${pane}` }, h('code', {}, ...body)));
}

/** 不合格の総評の直後に、対策の選び直しへ戻るボタンを差し込む */
function withRechoose(nodes: HTMLElement[], rechoose: HTMLButtonElement): HTMLElement[] {
  const index = nodes.findIndex((node) => node.classList.contains('banner-error'));
  if (index < 0) throw new Error('不合格の総評がありません');
  return [...nodes.slice(0, index + 1), rechoose, ...nodes.slice(index + 1)];
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
    '攻撃と普段の使い方を検証する',
  );
  private readonly verifyNote = h('p', { class: 'note', hidden: true });
  /** 検証中は押せない操作 */
  private readonly applyButton = h('button', { type: 'button', class: 'button', on: { click: () => this.selected && void this.actions.apply(this.selected) } }, 'この対策を適用する');
  private readonly revertButton = h('button', { type: 'button', class: 'button button-quiet', on: { click: () => void this.actions.apply(null) } }, '対策を取り消す');
  private readonly resetButton = h('button', { type: 'button', class: 'button button-danger', on: { click: () => void this.actions.reset() } }, '初期状態へ戻す');
  private readonly rechooseButton = h('button', { type: 'button', class: 'button', on: { click: () => this.returnToChoices() } }, '① に戻って対策を選び直す');
  private readonly results = h('div', { class: 'results' });
  private readonly resultsTitle = h('h3', { tabIndex: -1 }, '検証結果');
  private readonly resultsGuard = renderGuard();
  private defenses: DefenseDef[] = [];
  private selected: string | null = null;

  constructor(private readonly actions: RepairActions) {
    this.element = h('div', { class: 'repair' }, this.choiceSection(), this.verifySection(), this.resetSection());
  }

  setup(snapshot: ExerciseSnapshot): void {
    this.defenses = snapshot.pack.manifest.defenses;
    this.selected = snapshot.attempt.appliedDefense ?? this.defenses[0]?.id ?? null;
    this.reference.open = false;
    fill(
      this.choices,
      ...this.defenses.map((defense) =>
        radioOption(
          { name: 'defense', value: defense.id, checked: defense.id === this.selected, className: 'defense-option', onChange: () => this.select(defense.id) },
          h('span', { class: 'defense-text' }, h('strong', {}, defense.label), h('span', { class: 'note' }, defense.description)),
        ),
      ),
    );
    this.showDiff();
  }

  update(snapshot: ExerciseSnapshot): void {
    this.showApplied(snapshot.attempt.appliedDefense);
    this.showVerifyState(snapshot.attempt.state);
    this.showResults(snapshot);
  }

  /** 検証が終わったら結果へ移る */
  focusResults(): void {
    this.resultsTitle.focus();
    this.resultsTitle.scrollIntoView({ block: 'start' });
  }

  private choiceSection(): HTMLElement {
    return h(
      'section',
      { class: 'tool-section', 'data-anchor': 'defense-panel' },
      h('h3', { id: 'defense-title' }, '① 対策を選んで適用する'),
      h('p', { class: 'note' }, '対策を選んで適用すると、教材アプリの該当する処理が、あらかじめ用意した実装に切り替わります。'),
      this.choices,
      this.reference,
      h('div', { class: 'actions' }, this.applyButton, this.revertButton),
    );
  }

  private verifySection(): HTMLElement {
    return h(
      'section',
      { class: 'tool-section' },
      h('h3', {}, '② 検証する'),
      this.applied,
      h('div', { class: 'actions' }, this.verifyButton),
      this.verifyNote,
      h('section', { class: 'tool-section', 'data-anchor': 'results' }, this.resultsTitle, this.results),
      h('p', { class: 'note' }, '検証は、同じ初期データで、攻撃を防げたか・普段の使い方ができるか・ほかの守りが壊れていないかを確かめます。'),
    );
  }

  private resetSection(): HTMLElement {
    return h(
      'section',
      { class: 'tool-section', 'data-anchor': 'reset' },
      h('h3', {}, 'やり直す'),
      h('p', { class: 'note' }, '適用した対策を外し、データも演習開始時の状態へ戻します。達成印は残ります。'),
      h('div', { class: 'actions' }, this.resetButton),
    );
  }

  private showApplied(defenseId: string | null): void {
    const applied = this.defenses.find((defense) => defense.id === defenseId);
    const label = applied ? `適用中の対策：${applied.label}` : '対策は適用していません（脆弱な状態）';
    fill(this.applied, status('idle', label));
  }

  private showVerifyState(state: ExerciseSnapshot['attempt']['state']): void {
    const verifying = state === 'Verifying';
    const canVerify = state === 'Repairing' || state === 'Passed';
    this.verifyButton.disabled = verifying || !canVerify;
    this.applyButton.disabled = verifying;
    this.revertButton.disabled = verifying;
    this.resetButton.disabled = verifying;
    this.verifyNote.replaceChildren();
    if (verifying) fill(this.verifyNote, status('running', '検証しています…'));
    else if (!canVerify) this.verifyNote.textContent = '対策を適用すると検証できます（取り消した状態も検証できます）。';
    this.verifyNote.hidden = !verifying && canVerify;
  }

  private showResults(snapshot: ExerciseSnapshot): void {
    const { attempt } = snapshot;
    const report = attempt.lastVerification;
    const key = `${attempt.attemptId}|${report?.runId}|${attempt.configHash}|${snapshot.platformError}|${snapshot.vulnerableVerification?.runId}`;
    if (!this.resultsGuard.changed(key)) return;
    if (snapshot.platformError) {
      fill(this.results, h('div', { class: 'banner banner-warn', role: 'alert' }, status('error', '実行環境のエラー'), ` ${snapshot.platformError}（不合格には数えません）`));
      return;
    }
    if (!report) {
      fill(this.results, h('p', { class: 'muted' }, 'まだ検証していません。'));
      return;
    }
    const nodes = resultNodes(report, !isCurrent(report, attempt.configHash));
    fill(this.results, ...(verdictKind(report) === 'insufficient' ? withRechoose(nodes, this.rechooseButton) : nodes));
  }

  private select(id: string): void {
    this.selected = id;
    this.showDiff();
  }

  /** 参考コード差分（閲覧専用）。実際の切り替えは事前に用意した実装で行う */
  private showDiff(): void {
    const defense = this.defenses.find((item) => item.id === this.selected);
    this.reference.hidden = !defense;
    if (!defense) return void this.diff.replaceChildren();
    const { file, before, after, language } = defense.referenceDiff;
    fill(
      this.diff,
      h('h4', {}, `参考コード（閲覧専用）：${file}`),
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
