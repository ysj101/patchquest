// ターミナルの中に開く編集画面（visudo）。ファイルを行番号つきで並べ、行ごとに書き換える。保存は呼び出し側（端末）が送る。
// 本物のエディタと同じく、開いている間は端末の出力の代わりに表示する。
// 内容は入力欄の値として扱い、HTML として解釈しない。キーボードだけで操作できる（Tab で行を移り、Ctrl+S で保存、Esc で閉じる）
import { el } from '../shared/dom';
import type { EditorFile, LineEdit } from './shell';

export interface EditorActions {
  /** 書き換えた行を保存する。保存できなかったら理由を返し、編集画面は開いたままにする */
  save(edits: LineEdit[]): Promise<string | null>;
  /** 編集画面を閉じる。note は端末に残す一言 */
  close(note: string): void;
}

/** 入力欄の高さを、折り返した内容がすべて見える高さに合わせる。画面に置いたあとでないと測れない */
function fitHeight(input: HTMLTextAreaElement): void {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight + 2}px`;
}

/** 行ごとの入力欄。長い行も折り返して全部見えるよう textarea を使い、改行は入れさせない（1 つの欄が設定の 1 行） */
function lineInputs(file: EditorFile): HTMLTextAreaElement[] {
  return file.lines.map((text, index) => {
    const input = el('textarea', { className: 'term-input', value: text, rows: 1, ariaLabel: `${index + 1} 行目`, autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
    input.addEventListener('input', () => {
      if (/[\r\n]/.test(input.value)) input.value = input.value.replace(/[\r\n]+/g, ' ');
      fitHeight(input);
    });
    return input;
  });
}

/** 編集画面を作る。高さを合わせて最初の行にフォーカスを移すのは、画面に置いたあとで呼び出し側が focus で行う */
export function editorPanel(file: EditorFile, actions: EditorActions): { element: HTMLElement; focus(): void } {
  const inputs = lineInputs(file);
  const message = el('p', { className: 'term-err term-edit-message', role: 'alert' });
  const saveButton = el('button', { type: 'button', className: 'term-button' }, '保存して閉じる（Ctrl+S）');
  const cancelButton = el('button', { type: 'button', className: 'term-button' }, '保存せずに閉じる（Esc）');

  const cancel = () => actions.close(`visudo: ${file.path} は変更していません（保存せずに閉じました）`);
  const save = async () => {
    const edits = inputs.flatMap((input, index) => (input.value === file.lines[index] ? [] : [{ line: index + 1, text: input.value }]));
    if (edits.length === 0) return void actions.close(`visudo: ${file.path} unchanged`);
    saveButton.disabled = true;
    message.textContent = '';
    try {
      const error = await actions.save(edits);
      if (error !== null) message.textContent = error;
    } finally {
      saveButton.disabled = false;
    }
  };
  saveButton.addEventListener('click', () => void save());
  cancelButton.addEventListener('click', cancel);

  const element = el(
    'section',
    { className: 'term-editor', ariaLabel: `${file.path} の編集` },
    el('p', { className: 'term-note' }, `visudo: ${file.path} を編集しています。行の先頭に # を付けると、その行は設定として読まれなくなります（コメント）。`),
    el('ol', { className: 'term-edit-lines' }, ...inputs.map((input) => el('li', {}, input))),
    el('div', { className: 'term-edit-actions' }, saveButton, cancelButton),
    message,
  );
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof HTMLTextAreaElement) {
      event.preventDefault();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    }
  });
  return {
    element,
    focus() {
      inputs.forEach(fitHeight);
      inputs[0]?.focus();
    },
  };
}
