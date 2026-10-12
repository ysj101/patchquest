// ヒント・振り返り・理解確認（spec §9, §10）。ヒントは減点しないが利用を記録する。
// 理解確認は登録済みの選択肢で判定し、自由記述は採点しない
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { confirmDialog, radioOption, status } from './components';
import { fill, h, renderGuard } from './dom';
import { HINT_LABEL } from './labels';

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

export interface DebriefActions {
  answer(answers: Record<string, string>): void;
  retry(): void;
}

export class DebriefPanel {
  readonly element = h('div', { class: 'debrief', 'data-anchor': 'debrief' });
  private readonly guard = renderGuard();

  constructor(private readonly actions: DebriefActions) {}

  update(snapshot: ExerciseSnapshot): void {
    const { attempt, pack } = snapshot;
    const { answers } = attempt;
    const key = `${attempt.attemptId}|${attempt.badges.defense.achieved}|${attempt.badges.understanding.achieved}|${Object.entries(answers).join()}`;
    if (!this.guard.changed(key)) return;
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
    this.actions.answer(Object.fromEntries(snapshot.pack.manifest.transferCheck.map((q) => [q.id, String(data.get(q.id) ?? '')])));
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
