// ヒント・振り返り・理解確認（spec §9, §10）。ヒントは減点しないが利用を記録する。
// 理解確認は登録済みの選択肢で判定し、自由記述は採点しない
import { askedQuestions } from '../contract';
import { characterVoice, guideVoice, requesterVoice } from './characters';
import type { VulnerabilityCategory, VulnerabilityDef } from '../contract';
import { isCurrent } from '../evaluator/evaluator';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { confirmDialog, radioOption, status } from './components';
import { fill, h, renderGuard } from './dom';
import { securityComparison } from './security-comparison';
import { securityHistory } from './security-history';
import { HINT_LABEL, STALE_VERIFICATION } from './labels';
import type { MasterySummary } from '../progress/mastery';
import { masteryEvidence, masteryLine } from './mastery';
import { vulnerabilityTerms } from './vulnerability-terms';

export interface HintActions {
  openHint(level: 1 | 2 | 3): void;
  viewSolution(): void;
}

export class HintsPanel {
  readonly element = h('section', { class: 'tool-section hints', 'data-anchor': 'hints', 'aria-labelledby': 'hints-title' });
  private readonly guard = renderGuard();

  constructor(private readonly actions: HintActions) {}

  update(snapshot: ExerciseSnapshot): void {
    const { attempt, pack } = snapshot;
    if (!this.guard.changed(`${attempt.attemptId}|${attempt.hintsOpened.join()}|${attempt.solutionViewed}`)) return;
    const hadFocus = this.element.contains(document.activeElement);
    const hints = [...pack.manifest.hints].sort((a, b) => a.level - b.level);
    const opened = hints.filter((hint) => attempt.hintsOpened.includes(hint.level));
    const next = hints.find((hint) => !attempt.hintsOpened.includes(hint.level));
    fill(
      this.element,
      h('h3', { id: 'hints-title' }, 'ヒント'),
      h('p', { class: 'note' }, '行き詰まったら順に開けます。使っても減点はありません。'),
      ...opened.map((hint) => h('div', { class: 'hint' }, h('p', { class: 'eyebrow' }, `ヒント ${hint.level}：${HINT_LABEL[hint.level]}`), h('p', {}, hint.text))),
      next
        ? h('button', { type: 'button', class: 'button', on: { click: () => this.actions.openHint(next.level) } }, `ヒント ${next.level}（${HINT_LABEL[next.level]}）を見る`)
        : attempt.solutionViewed
          ? h('div', { class: 'hint hint-solution' }, h('p', { class: 'eyebrow' }, '解法'), h('p', {}, pack.manifest.solution))
          : h('button', { type: 'button', class: 'button button-quiet', on: { click: () => void this.revealSolution() } }, '解法を見る'),
    );
    // 開いた内容のすぐ後ろ（次のボタン）へフォーカスを移す
    if (hadFocus) this.element.querySelector<HTMLElement>('button')?.focus();
  }

  private async revealSolution(): Promise<void> {
    const ok = await confirmDialog({
      title: '解法を見ますか？',
      body: '解法を見たことは、あなたの記録に残ります。減点はありません。',
      confirm: '解法を見る',
    });
    if (ok) this.actions.viewSolution();
  }
}

/** 学び終えた時点で、体験した問題を正式な名前と結びつける。一覧の ⓘ と同じ言い方で出す */
function termsNote(vulnerability: VulnerabilityDef): HTMLElement {
  return h('div', { class: 'terms-note' }, h('p', { class: 'eyebrow' }, `いま直した問題は「${vulnerability.name}」と呼ばれます`), vulnerabilityTerms(vulnerability));
}

/** この課題の分類の習熟度と判定の根拠。分類のないパックでは出さない */
function masterySection(category: VulnerabilityCategory | undefined, mastery: MasterySummary): HTMLElement | null {
  if (category === undefined) return null;
  return h('section', { class: 'tool-section', 'aria-labelledby': 'mastery-section-title' }, h('h3', { id: 'mastery-section-title' }, '習熟度'), masteryLine(mastery[category]), masteryEvidence(mastery[category]));
}

export interface DebriefActions {
  answer(answers: Record<string, string>): void;
  retry(): void;
}

/** 理解確認の出題の種類。通常の演習と、出題を絞った演習で説明が分かれる */
type TransferKind = 'normal' | 'fresh' | 'repeated';
const TRANSFER_NOTE: Record<TransferKind, string> = {
  normal: '演習とは違う状況で、原因と有効な対策を選びます。',
  fresh: '前回と違う設問を 1 問出します。',
  repeated: 'この課題の設問はすべて出し終えているため、前回と同じ設問を 1 問出し直します。',
};
function transferKind(challenge: ExerciseSnapshot['attempt']['challenge']): TransferKind {
  if (challenge === null) return 'normal';
  return challenge.repeatsPrevious ? 'repeated' : 'fresh';
}

export class DebriefPanel {
  readonly element = h('div', { class: 'debrief', 'data-anchor': 'debrief' });
  private readonly guard = renderGuard();

  constructor(private readonly actions: DebriefActions) {}

  /** mastery はこの演習を含めて計算した分類ごとの習熟度。課題の分類がないパック（練習）では出さない。 */
  update(snapshot: ExerciseSnapshot, mastery: MasterySummary): void {
    const { attempt, pack } = snapshot;
    const { answers } = attempt;
    const key = `${attempt.attemptId}|${attempt.badges.reproduction.achieved}|${attempt.badges.defense.achieved}|${attempt.badges.understanding.achieved}|${Object.entries(answers).join()}|${attempt.configHash}|${snapshot.vulnerableVerification?.runId}|${attempt.lastVerification?.runId}`;
    if (!this.guard.changed(key)) return;
    const { debrief, fixtures } = pack.manifest;
    const retry = this.retrySection(fixtures.variants.length);
    if (!attempt.badges.defense.achieved) {
      fill(
        this.element,
        h('section', { class: 'tool-section' }, h('h3', {}, '振り返り'), h('p', { class: 'muted' }, '対策を検証して防御に合格すると、原因と対策の振り返り、理解の確認ができます。')),
        securityHistory(snapshot),
        masterySection(pack.manifest.vulnerability?.category, mastery),
        retry,
      );
      return;
    }
    const form = this.transferForm(snapshot);
    const kind = transferKind(attempt.challenge);
    const closing = requesterVoice(pack.manifest.story.requester, 'closing');
    fill(
      this.element,
      attempt.lastVerification && !isCurrent(attempt.lastVerification, attempt.configHash) ? h('p', { class: 'banner banner-warn' }, STALE_VERIFICATION) : null,
      attempt.lastVerification ? securityComparison(snapshot.vulnerableVerification, attempt.lastVerification) : null,
      securityHistory(snapshot),
      guideVoice('closing'),
      closing ? characterVoice(closing) : null,
      h('section', { class: 'tool-section' }, h('h3', {}, '原因'), h('p', {}, debrief.cause), pack.manifest.vulnerability ? termsNote(pack.manifest.vulnerability) : null),
      h('section', { class: 'tool-section' }, h('h3', {}, 'この対策が効く理由'), h('p', {}, debrief.defenseRationale)),
      h('section', { class: 'tool-section' }, h('h3', {}, '持ち帰ること'), h('ul', {}, ...debrief.takeaways.map((t) => h('li', {}, t)))),
      masterySection(pack.manifest.vulnerability?.category, mastery),
      h(
        'section',
        { class: 'tool-section', 'aria-labelledby': 'transfer-title' },
        h('h3', { id: 'transfer-title' }, '理解の確認'),
        h('p', { class: 'note', 'data-transfer-note': kind }, TRANSFER_NOTE[kind]),
        attempt.badges.understanding.achieved ? h('p', { class: 'banner banner-ok' }, status('passed', '理解の検印を押しました')) : null,
        form,
      ),
      retry,
    );
  }

  private transferForm(snapshot: ExerciseSnapshot): HTMLFormElement {
    const transferCheck = askedQuestions(snapshot.pack.manifest, snapshot.attempt);
    const { answers } = snapshot.attempt;
    const form = h(
      'form',
      { class: 'transfer', on: { submit: (e) => (e.preventDefault(), this.submit(form, snapshot)) } },
      ...transferCheck.map((q) => {
        // 回答済みの設問だけ正誤を示す
        const result = q.id in answers ? q.choices.find((c) => c.id === answers[q.id])?.correct === true : undefined;
        return h(
          'fieldset',
          { class: 'question' },
          h('legend', {}, q.prompt),
          h('p', { class: 'situation' }, `状況：${q.situation}`),
          ...q.choices.map((c) =>
            radioOption(
              { name: q.id, value: c.id, checked: answers[q.id] === c.id, className: 'choice', required: true },
              h('span', {}, c.label),
              result !== undefined && answers[q.id] === c.id ? h('span', { class: 'note choice-explanation' }, c.explanation) : null,
            ),
          ),
          result === undefined ? null : status(result ? 'passed' : 'failed', result ? '正解' : '不正解。別の選択肢も考えてみましょう'),
        );
      }),
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'button button-primary' }, '回答する')),
    );
    return form;
  }

  private submit(form: HTMLFormElement, snapshot: ExerciseSnapshot): void {
    const data = new FormData(form);
    this.actions.answer(Object.fromEntries(askedQuestions(snapshot.pack.manifest, snapshot.attempt).map((q) => [q.id, String(data.get(q.id) ?? '')])));
  }

  private retrySection(variantCount: number): HTMLElement {
    return h(
      'section',
      { class: 'tool-section', 'aria-labelledby': 'retry-title' },
      h('h3', { id: 'retry-title' }, '再挑戦'),
      h(
        'p',
        { class: 'note' },
        variantCount > 1
          ? '新しい演習票で始めます。利用者やメモなどのデータと、脆弱性のバリエーションが変わることがあります。'
          : '新しい演習票で始めます。利用者やメモなどのデータが変わります（脆弱性の種類は同じです）。',
      ),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'button', on: { click: this.actions.retry } }, '新しいデータで再挑戦する')),
    );
  }
}
