// 対策パネルと検証結果（spec §10）。修正方針を選んで適用・取り消しし、参考コード差分を閲覧し、
// 攻撃阻止・正常系・回帰を検証する。合否は実際の実行結果だけで決まり、選んだ対策の ID では決まらない
import { RESULT_GROUPS, type DefenseDef, type TestOutcome, type VerificationReport } from '../contract';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { status } from './components';
import { fill, h } from './dom';
import { GROUP_LABEL } from './labels';

export interface RepairActions {
  apply(defenseId: string | null): Promise<void>;
  verify(): Promise<void>;
  reset(): Promise<void>;
}

/** 検証結果の総評。記号と言葉で示す */
function verdict(report: VerificationReport): HTMLElement {
  const failed = report.outcomes.filter((o) => !o.passed);
  if (failed.length === 0) return h('div', { class: 'banner banner-ok' }, status('passed', '防御できました'), ' 攻撃を防ぎ、普段の使い方も通りました。');
  if (failed.some((o) => o.error)) {
    return h('div', { class: 'banner banner-warn' }, status('error', '判定できませんでした'), ' 実行環境のエラーです。不合格には数えません。もう一度検証してください。');
  }
  const groups = new Set(failed.map((o) => o.group));
  const reasons = [
    groups.has('attack') && '攻撃をまだ防げていません',
    groups.has('normal') && '普段の使い方が壊れています',
    groups.has('regression') && 'ほかの守りが壊れています',
  ].filter(Boolean);
  return h('div', { class: 'banner banner-error' }, status('failed', 'まだ合格ではありません'), ` ${reasons.join('。')}。`);
}

function outcomeItem(o: TestOutcome): HTMLElement {
  const [kind, text] = o.error ? (['error', '判定不可'] as const) : o.passed ? (['passed', '合格'] as const) : (['failed', '不合格'] as const);
  return h(
    'li',
    { class: 'outcome' },
    h('div', { class: 'outcome-head' }, status(kind, text), h('span', {}, o.title)),
    h('dl', { class: 'outcome-detail' }, h('dt', {}, '期待'), h('dd', { class: 'mono' }, o.expected), h('dt', {}, '実測'), h('dd', { class: 'mono' }, o.actual)),
  );
}

function results(report: VerificationReport, stale: boolean): HTMLElement[] {
  return [
    stale ? h('p', { class: 'banner banner-warn' }, '対策を変えたため、この結果はいまの構成のものではありません。もう一度検証してください。') : null,
    verdict(report),
    ...RESULT_GROUPS.map((group) => {
      const items = report.outcomes.filter((o) => o.group === group);
      if (items.length === 0) return null;
      const passed = items.filter((o) => o.passed).length;
      return h('section', { class: 'result-group' }, h('h4', {}, `${GROUP_LABEL[group]}（${passed}/${items.length} 件合格）`), h('ul', { class: 'outcomes' }, ...items.map(outcomeItem)));
    }),
  ].filter((e): e is HTMLElement => e !== null);
}

export class RepairPanel {
  readonly element: HTMLElement;
  private readonly choices = h('div', { class: 'defense-choices', role: 'radiogroup', 'aria-labelledby': 'defense-title' });
  private readonly applied = h('p', { class: 'applied' });
  private readonly diff = h('div', { class: 'diff' });
  private readonly verifyButton = h('button', { type: 'button', class: 'button button-primary', on: { click: () => void this.actions.verify() } }, '攻撃と普段の使い方を検証する');
  private readonly verifyNote = h('p', { class: 'note' });
  /** 検証中は押せない操作 */
  private readonly applyButton = h('button', { type: 'button', class: 'button', on: { click: () => this.selected && void this.actions.apply(this.selected) } }, 'この対策を適用する');
  private readonly revertButton = h('button', { type: 'button', class: 'button button-quiet', on: { click: () => void this.actions.apply(null) } }, '対策を取り消す');
  private readonly resetButton = h('button', { type: 'button', class: 'button button-danger', on: { click: () => void this.actions.reset() } }, '初期状態へ戻す');
  private readonly results = h('div', { class: 'results' });
  private readonly resultsTitle = h('h3', { tabIndex: -1 }, '検証結果');
  private defenses: DefenseDef[] = [];
  private selected: string | null = null;

  constructor(private readonly actions: RepairActions) {
    this.element = h(
      'div',
      { class: 'repair' },
      h(
        'section',
        { class: 'tool-section', 'data-anchor': 'defense-panel' },
        h('h3', { id: 'defense-title' }, '対策を選ぶ'),
        h('p', { class: 'note' }, '対策を選んで適用すると、教材アプリの該当する処理が、あらかじめ用意した実装に切り替わります。'),
        this.choices,
        h('div', { class: 'actions' }, this.applyButton, this.revertButton),
        this.applied,
        this.diff,
      ),
      h(
        'section',
        { class: 'tool-section', 'data-anchor': 'verify' },
        h('h3', {}, '検証'),
        h('p', { class: 'note' }, '同じ初期データで、攻撃を防げたか・普段の使い方ができるか・ほかの守りが壊れていないかを確かめます。'),
        h('div', { class: 'actions' }, this.verifyButton),
        this.verifyNote,
      ),
      h('section', { class: 'tool-section', 'data-anchor': 'results' }, this.resultsTitle, this.results),
      h(
        'section',
        { class: 'tool-section', 'data-anchor': 'reset' },
        h('h3', {}, 'やり直す'),
        h('p', { class: 'note' }, '適用した対策を外し、データも演習開始時の状態へ戻します。達成印は残ります。'),
        h('div', { class: 'actions' }, this.resetButton),
      ),
    );
  }

  setup(snapshot: ExerciseSnapshot): void {
    this.defenses = snapshot.pack.manifest.defenses;
    this.selected = snapshot.attempt.appliedDefense ?? this.defenses[0]?.id ?? null;
    fill(
      this.choices,
      ...this.defenses.map((d) =>
        h(
          'label',
          { class: 'defense-option' },
          h('input', { type: 'radio', name: 'defense', value: d.id, checked: d.id === this.selected, on: { change: () => this.select(d.id) } }),
          h('span', { class: 'defense-text' }, h('strong', {}, d.label), h('span', { class: 'note' }, d.description)),
        ),
      ),
    );
    this.showDiff();
  }

  update(snapshot: ExerciseSnapshot): void {
    const { attempt } = snapshot;
    const applied = this.defenses.find((d) => d.id === attempt.appliedDefense);
    fill(this.applied, applied ? status('idle', `適用中の対策：${applied.label}`) : status('idle', '対策は適用していません（脆弱な状態）'));

    const verifying = attempt.state === 'Verifying';
    const canVerify = attempt.state === 'Repairing' || attempt.state === 'Passed';
    this.verifyButton.disabled = verifying || !canVerify;
    this.applyButton.disabled = this.revertButton.disabled = this.resetButton.disabled = verifying;
    this.verifyNote.textContent = verifying ? '' : canVerify ? '' : '対策を適用すると検証できます（取り消した状態も検証できます）。';
    if (verifying) fill(this.verifyNote, status('running', '検証しています…'));

    if (snapshot.platformError) {
      fill(this.results, h('div', { class: 'banner banner-warn', role: 'alert' }, status('error', '実行環境のエラー'), ` ${snapshot.platformError}（不合格には数えません）`));
    } else if (attempt.lastVerification) {
      fill(this.results, ...results(attempt.lastVerification, attempt.lastVerification.configHash !== attempt.configHash));
    } else {
      fill(this.results, h('p', { class: 'muted' }, 'まだ検証していません。'));
    }
  }

  /** 検証が終わったら結果へ移る */
  focusResults(): void {
    this.resultsTitle.focus();
    this.resultsTitle.scrollIntoView({ block: 'start' });
  }

  private select(id: string): void {
    this.selected = id;
    this.showDiff();
  }

  /** 参考コード差分（閲覧専用）。実際の切り替えは事前に用意した実装で行う */
  private showDiff(): void {
    const defense = this.defenses.find((d) => d.id === this.selected);
    if (!defense) return void this.diff.replaceChildren();
    const { file, before, after } = defense.referenceDiff;
    fill(
      this.diff,
      h('h4', {}, `参考コード（閲覧専用）：${file}`),
      h('div', { class: 'diff-pair' }, h('figure', {}, h('figcaption', {}, '変更前（いまの状態）'), h('pre', { class: 'mono diff-before' }, before)), h('figure', {}, h('figcaption', {}, `変更後（${defense.label}）`), h('pre', { class: 'mono diff-after' }, after))),
    );
  }
}
