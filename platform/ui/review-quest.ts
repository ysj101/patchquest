// 課題一覧の復習クエスト。解決済みの課題の理解確認から 1 問を出し、答えると解説と XP の増減を文字で示す。達成印は変えない
import type { ReviewEntry, ReviewQuestion } from '../progress/review';
import { REVIEW_XP } from '../progress/review';
import { radioOption, status } from './components';
import { fill, h } from './dom';

export interface ReviewActions {
  /** 回答を記録し、XP が増えたかを返す */
  answer(entry: ReviewEntry): Promise<{ rewarded: boolean }>;
  /** 次の問題へ（一覧を描き直す） */
  next(): void;
}

const NOTE = `解決した課題から 1 問だけ出します。正解すると 1 日 1 回まで ${REVIEW_XP} XP。達成印や習熟度の判定は、復習では変わりません。`;

function empty(): HTMLElement {
  return h('p', { class: 'muted' }, '課題を 1 つ解決すると、ここに復習の問題が出ます。');
}

function result(question: ReviewQuestion, choiceId: string, rewarded: boolean, actions: ReviewActions): HTMLElement {
  const choice = question.question.choices.find((candidate) => candidate.id === choiceId);
  if (!choice) throw new Error(`選択肢 ${choiceId} はありません`);
  let reward = '';
  if (choice.correct) reward = rewarded ? `+${REVIEW_XP} XP を獲得しました。` : `今日の復習 XP は獲得済みです（1 日 ${REVIEW_XP} XP まで）。`;
  return h(
    'div',
    { class: 'review-result', role: 'status' },
    status(choice.correct ? 'passed' : 'failed', choice.correct ? '正解' : '不正解'),
    h('p', { class: 'review-explanation' }, choice.explanation),
    reward ? h('p', { class: 'xp-gain' }, reward) : null,
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'button', on: { click: () => actions.next() } }, '次の復習へ')),
  );
}

function form(question: ReviewQuestion, actions: ReviewActions, now: () => Date): HTMLFormElement {
  const { question: transfer } = question;
  const name = `review-${question.missionId}-${transfer.id}`;
  const panel = h(
    'form',
    {
      class: 'review-form',
      on: {
        submit: (event) => {
          event.preventDefault();
          const picked = new FormData(panel).get(name);
          const choiceId = typeof picked === 'string' ? picked : '';
          const choice = transfer.choices.find((candidate) => candidate.id === choiceId);
          if (!choice) return;
          const entry: ReviewEntry = { at: now().toISOString(), missionId: question.missionId, questionId: transfer.id, correct: choice.correct };
          void actions.answer(entry).then(({ rewarded }) => fill(panel, result(question, choiceId, rewarded, actions)));
        },
      },
    },
    h(
      'fieldset',
      { class: 'question' },
      h('legend', {}, `${question.missionTitle}：${transfer.prompt}`),
      h('p', { class: 'situation' }, `状況：${transfer.situation}`),
      ...transfer.choices.map((choice) => radioOption({ name, value: choice.id, checked: false, className: 'choice', required: true }, h('span', {}, choice.label))),
    ),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'button button-primary' }, '回答する')),
  );
  return panel;
}

/** 復習クエストの区画。question が null なら案内だけを出す */
export function reviewQuest(question: ReviewQuestion | null, actions: ReviewActions, now: () => Date = () => new Date()): HTMLElement {
  return h(
    'section',
    { class: 'review-quest', 'aria-labelledby': 'review-title' },
    h('h2', { id: 'review-title' }, '復習クエスト'),
    h('p', { class: 'note' }, NOTE),
    question ? form(question, actions, now) : empty(),
  );
}
