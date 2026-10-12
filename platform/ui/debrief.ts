// ヒント・振り返り・理解確認（spec §9, §10）。ヒントは減点しないが利用を記録する。
// 理解確認は登録済みの選択肢で判定し、自由記述は採点しない
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { confirmDialog, status } from './components';
import { fill, h } from './dom';

const HINT_LABEL = { 1: '着眼点', 2: '調査方法', 3: '修正方針' } as const;

export interface HintActions {
  openHint(level: 1 | 2 | 3): void;
  viewSolution(): void;
}

export class HintsPanel {
  readonly element = h('section', { class: 'tool-section hints', 'data-anchor': 'hints', 'aria-labelledby': 'hints-title' });
  private rendered = '';

  constructor(private readonly actions: HintActions) {}

  update(snapshot: ExerciseSnapshot): void {
    const { attempt, pack } = snapshot;
    // 開いたヒントが変わったときだけ描き直す（操作中のフォーカスを失わないため）
    const key = `${attempt.attemptId}|${attempt.hintsOpened.join()}|${attempt.solutionViewed}`;
    if (key === this.rendered) return;
    const hadFocus = this.element.contains(document.activeElement);
    this.rendered = key;
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

export interface DebriefActions {
  answer(answers: Record<string, string>): void;
  retry(): void;
}

export class DebriefPanel {
  readonly element = h('div', { class: 'debrief', 'data-anchor': 'debrief' });
  private feedback: Record<string, boolean> | null = null;
  private rendered = '';

  constructor(private readonly actions: DebriefActions) {}

  /** 新しい演習を始めたときに、前の回答の表示を消す */
  reset(): void {
    this.feedback = null;
    this.rendered = '';
  }

  update(snapshot: ExerciseSnapshot): void {
    const { attempt, pack } = snapshot;
    // 選択中の回答を消さないよう、表示が変わるときだけ描き直す
    const key = JSON.stringify([attempt.attemptId, attempt.badges.defense.achieved, attempt.badges.understanding.achieved, attempt.answers, this.feedback]);
    if (key === this.rendered) return;
    this.rendered = key;
    const { debrief, transferCheck, fixtures } = pack.manifest;
    if (!attempt.badges.defense.achieved) {
      fill(
        this.element,
        h('section', { class: 'tool-section' }, h('h3', {}, '振り返り'), h('p', { class: 'muted' }, '対策を検証して防御に合格すると、原因と対策の振り返り、理解の確認ができます。')),
        this.retrySection(fixtures.variants.length),
      );
      return;
    }
    const form = h(
      'form',
      { class: 'transfer', on: { submit: (e) => (e.preventDefault(), this.submit(form, snapshot)) } },
      ...transferCheck.map((q) => {
        const result = this.feedback?.[q.id];
        return h(
          'fieldset',
          { class: 'question' },
          h('legend', {}, q.prompt),
          h('p', { class: 'situation' }, `状況：${q.situation}`),
          ...q.choices.map((c) =>
            h(
              'label',
              { class: 'choice' },
              h('input', { type: 'radio', name: q.id, value: c.id, checked: attempt.answers[q.id] === c.id, required: true }),
              h('span', {}, c.label),
              result !== undefined && attempt.answers[q.id] === c.id ? h('span', { class: 'note choice-explanation' }, c.explanation) : null,
            ),
          ),
          result === undefined ? null : status(result ? 'passed' : 'failed', result ? '正解' : '不正解。別の選択肢も考えてみましょう'),
        );
      }),
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'button button-primary' }, '回答する')),
    );
    fill(
      this.element,
      h('section', { class: 'tool-section' }, h('h3', {}, '原因'), h('p', {}, debrief.cause)),
      h('section', { class: 'tool-section' }, h('h3', {}, 'この対策が効く理由'), h('p', {}, debrief.defenseRationale)),
      h('section', { class: 'tool-section' }, h('h3', {}, '持ち帰ること'), h('ul', {}, ...debrief.takeaways.map((t) => h('li', {}, t)))),
      h(
        'section',
        { class: 'tool-section', 'aria-labelledby': 'transfer-title' },
        h('h3', { id: 'transfer-title' }, '理解の確認'),
        h('p', { class: 'note' }, '演習とは違う状況で、原因と有効な対策を選びます。'),
        attempt.badges.understanding.achieved ? h('p', { class: 'banner banner-ok' }, status('passed', '理解の検印を押しました')) : null,
        form,
      ),
      this.retrySection(fixtures.variants.length),
    );
  }

  private submit(form: HTMLFormElement, snapshot: ExerciseSnapshot): void {
    const data = new FormData(form);
    const answers = Object.fromEntries(snapshot.pack.manifest.transferCheck.map((q) => [q.id, String(data.get(q.id) ?? '')]));
    this.feedback = Object.fromEntries(
      snapshot.pack.manifest.transferCheck.map((q) => [q.id, q.choices.find((c) => c.id === answers[q.id])?.correct === true]),
    );
    this.actions.answer(answers);
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
