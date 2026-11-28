// ヒント・振り返り・理解確認（spec §9, §10）。ヒントは減点しないが利用を記録する。
// 理解確認は登録済みの選択肢で判定し、自由記述は採点しない
import { askedQuestions } from '../contract';
import type { TransferQuestion, VulnerabilityDef } from '../contract';
import { isCurrent } from '../evaluator/evaluator';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { confirmDialog, radioOption, status, withCode } from './components';
import { fill, h, renderGuard } from './dom';
import { headingWithInfo } from './info-popover';
import { securityHistory } from './security-history';
import { HINT_LABEL, STALE_VERIFICATION } from './labels';
import { vulnerabilityTerms } from './vulnerability-terms';

export interface HintActions {
  openHint(level: 1 | 2 | 3): void;
  viewSolution(): void;
}

/**
 * 置き場所が出すヒントの範囲。all は 3 段階を順に開く。repair は直し方だけを出し、見るところ・調べ方を開いていなくても開ける
 * （直している人に、調べるときのヒントを先に開かせない）
 */
const HINT_SCOPE = {
  all: { levels: [1, 2, 3], note: '困ったら、順番に開けます。見ても減点はありません。' },
  repair: { levels: [3], note: '直し方のヒントです。調べるときのヒントは、「調査」のタブにあります。見ても減点はありません。' },
} as const;
type HintScope = keyof typeof HINT_SCOPE;

/** ヒントの置き場所 1 つ。見出しの id は置き場所ごとに分ける */
interface HintsPlace {
  titleId: string;
  scope: HintScope;
  element: HTMLElement;
}

/** 同じヒントを、作った置き場所のすべてに出す（出す範囲は置き場所ごとに決める）。開いた段階は演習の記録で共有する */
export class HintsPanel {
  private readonly places: HintsPlace[] = [];
  private readonly guard = renderGuard();
  private last: ExerciseSnapshot | null = null;

  constructor(private readonly actions: HintActions) {}

  /** 置き場所を 1 つ作り、その要素を返す。titleId は見出しの id で、置き場所ごとに違う値にする */
  place(titleId: string, scope: HintScope = 'all'): HTMLElement {
    if (this.places.some((place) => place.titleId === titleId)) throw new Error(`ヒントの置き場所「${titleId}」はすでにあります`);
    const place = { titleId, scope, element: h('section', { class: 'tool-section hints', 'data-anchor': 'hints', 'aria-labelledby': titleId }) };
    this.places.push(place);
    if (this.last) this.render(place, this.last);
    return place.element;
  }

  update(snapshot: ExerciseSnapshot): void {
    this.last = snapshot;
    const { attempt } = snapshot;
    if (!this.guard.changed(`${attempt.attemptId}|${attempt.hintsOpened.join()}|${attempt.solutionViewed}`)) return;
    for (const place of this.places) this.render(place, snapshot);
  }

  private render({ titleId, scope, element }: HintsPlace, snapshot: ExerciseSnapshot): void {
    const { attempt, pack } = snapshot;
    const hadFocus = element.contains(document.activeElement);
    const { levels, note } = HINT_SCOPE[scope];
    const hints = pack.manifest.hints.filter((hint) => (levels as readonly number[]).includes(hint.level)).sort((a, b) => a.level - b.level);
    const next = hints.find((hint) => !attempt.hintsOpened.includes(hint.level));
    // 段階の順に並べる。開いた段階は本文を、まだの段階は最初の 1 つだけをボタンで出す（別の置き場所から、先の段階だけが開かれていることがある）
    const shown = hints.filter((hint) => hint === next || attempt.hintsOpened.includes(hint.level));
    fill(
      element,
      headingWithInfo(h('h3', { id: titleId }, 'ヒント'), h('p', {}, note)),
      ...shown.map((hint) =>
        hint === next
          ? h('button', { type: 'button', class: 'button', on: { click: () => this.actions.openHint(hint.level) } }, `ヒント ${hint.level}（${HINT_LABEL[hint.level]}）を見る`)
          : h('div', { class: 'hint' }, h('p', { class: 'eyebrow' }, `ヒント ${hint.level}：${HINT_LABEL[hint.level]}`), h('p', {}, ...withCode(hint.text))),
      ),
      next ? null : this.solutionNode(snapshot),
    );
    // 開いた内容のすぐ後ろ（次のボタン）へフォーカスを移す。解法まで開いてボタンがなくなったら、解法へ移す
    if (hadFocus) (element.querySelector<HTMLElement>('button.button') ?? element.querySelector<HTMLElement>('.hint-solution'))?.focus();
  }

  /** 置き場所のヒントをすべて開いたあとに出す。解法は、確認してから見せる */
  private solutionNode({ attempt, pack }: ExerciseSnapshot): HTMLElement {
    if (attempt.solutionViewed) return h('div', { class: 'hint hint-solution', tabIndex: -1 }, h('p', { class: 'eyebrow' }, '解法'), h('p', {}, ...withCode(pack.manifest.solution)));
    return h('button', { type: 'button', class: 'button button-quiet', on: { click: () => void this.revealSolution() } }, '解法を見る');
  }

  private async revealSolution(): Promise<void> {
    const ok = await confirmDialog({
      title: '解法を見ますか？',
      body: '解法を見たことは記録に残ります。減点はありません。',
      confirm: '解法を見る',
    });
    if (ok) this.actions.viewSolution();
  }
}

/** 学び終えた時点で、体験した問題を正式な名前と結びつける。名前だけを見せ、正式名・分類・CWE は開いたときに一覧の ⓘ と同じ言い方で出す */
function termsNote(vulnerability: VulnerabilityDef): HTMLElement {
  return h('details', { class: 'terms-note debrief-fold' }, h('summary', {}, `いま直した問題は「${vulnerability.name}」といいます`), vulnerabilityTerms(vulnerability, 'info'));
}

export interface DebriefActions {
  answer(answers: Record<string, string>): void;
}

/** 理解確認の出題の種類。通常の演習と、出題を絞った演習で説明が分かれる */
type TransferKind = 'normal' | 'fresh' | 'repeated';
/** 出題を絞った演習でだけ、ふだんと違う出し方を知らせる */
const TRANSFER_NOTE: Record<Exclude<TransferKind, 'normal'>, string> = {
  fresh: '前回と違う問題を 1 問出します。',
  repeated: 'この課題の問題はすべて出し終えたので、前回と同じ問題を 1 問出します。',
};
function transferKind(challenge: ExerciseSnapshot['attempt']['challenge']): TransferKind {
  if (challenge === null) return 'normal';
  return challenge.repeatsPrevious ? 'repeated' : 'fresh';
}

export class DebriefPanel {
  readonly element = h('div', { class: 'debrief', 'data-anchor': 'debrief' });
  private readonly guard = renderGuard();

  constructor(private readonly actions: DebriefActions) {}

  update(snapshot: ExerciseSnapshot): void {
    const { attempt, pack } = snapshot;
    const { answers } = attempt;
    const key = `${attempt.attemptId}|${attempt.badges.reproduction.achieved}|${attempt.badges.defense.achieved}|${attempt.badges.understanding.achieved}|${Object.entries(answers).join()}|${attempt.configHash}|${snapshot.vulnerableVerification?.runId}|${attempt.lastVerification?.runId}`;
    if (!this.guard.changed(key)) return;
    const { debrief } = pack.manifest;
    if (!attempt.badges.defense.achieved) {
      fill(
        this.element,
        h('section', { class: 'tool-section' }, h('h3', {}, '振り返り'), h('p', { class: 'muted' }, '対策をテストして防御に合格すると、ここで原因と対策を振り返れます。')),
        securityHistory(snapshot),
      );
      return;
    }
    // 「答える」を押すと設問ごと描き直すので、設問の中にあったフォーカスを見出しへ移す（結果を上から読める）
    const answering = this.element.querySelector('form.transfer')?.contains(document.activeElement) === true;
    const form = this.transferForm(snapshot);
    const kind = transferKind(attempt.challenge);
    const lesson = [
      h('section', { class: 'tool-section debrief-cause' }, h('h3', {}, '原因'), h('p', {}, debrief.cause)),
      h('section', { class: 'tool-section debrief-reason' }, h('h3', {}, 'この対策が効く理由'), h('p', {}, debrief.defenseRationale)),
      // 原因と理由を先に読ませ、まとめは開いたときに出す
      h('details', { class: 'debrief-takeaway debrief-fold' }, h('summary', {}, '覚えておくこと'), h('ul', {}, ...debrief.takeaways.map((takeaway) => h('li', {}, takeaway)))),
    ];
    fill(
      this.element,
      attempt.lastVerification && !isCurrent(attempt.lastVerification, attempt.configHash) ? h('p', { class: 'banner banner-warn' }, STALE_VERIFICATION) : null,
      ...lesson,
      pack.manifest.vulnerability ? termsNote(pack.manifest.vulnerability) : null,
      securityHistory(snapshot),
      h(
        'section',
        { class: 'tool-section', 'aria-labelledby': 'transfer-title' },
        h('h3', { id: 'transfer-title', tabIndex: -1 }, '理解の確認'),
        kind === 'normal' ? null : h('p', { class: 'note', 'data-transfer-note': kind }, TRANSFER_NOTE[kind]),
        attempt.badges.understanding.achieved ? h('p', { class: 'banner banner-ok' }, status('passed', '「理解」達成です')) : null,
        form,
      ),
    );
    if (answering) this.element.querySelector<HTMLElement>('#transfer-title')?.focus();
  }

  private transferForm(snapshot: ExerciseSnapshot): HTMLFormElement {
    const transferCheck = askedQuestions(snapshot.pack.manifest, snapshot.attempt);
    const { answers } = snapshot.attempt;
    const form = h(
      'form',
      { class: 'transfer', on: { submit: (e) => (e.preventDefault(), this.submit(form, transferCheck)) } },
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
          result === undefined ? null : status(result ? 'passed' : 'failed', result ? '正解' : '不正解。ほかの答えも考えてみましょう'),
        );
      }),
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'button button-primary' }, '答える')),
    );
    return form;
  }

  private submit(form: HTMLFormElement, questions: readonly TransferQuestion[]): void {
    const data = new FormData(form);
    this.actions.answer(Object.fromEntries(questions.map((q) => [q.id, String(data.get(q.id) ?? '')])));
  }
}
