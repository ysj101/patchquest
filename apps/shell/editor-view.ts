// ターミナルの中に開く編集画面（visudo）。ファイルを行番号つきで並べ、行ごとに書き換える。行を足す・消すこともできる。保存は呼び出し側（端末）が送る。
// 本物のエディタと同じく、開いている間は端末の出力の代わりに表示する。
// 内容は入力欄の値として扱い、HTML として解釈しない。キーボードだけで操作できる
// （Tab で行を移り、Enter で下に行を足し、空の行で Backspace を押すとその行を消す。Ctrl+S で保存、Esc で閉じる）
import { el } from '../shared/dom';
import type { LineEdit } from './edits';
import type { EditorFile } from './shell';

export interface EditorActions {
  /** 編集（行の書き換え・削除・追加）を保存する。保存できなかったら理由を返し、編集画面は開いたままにする */
  save(edits: LineEdit[]): Promise<string | null>;
  /** 編集画面を閉じる。note は端末に残す一言 */
  close(note: string): void;
}

/** 編集画面の 1 行。origin は開いたときの行番号（1 から）。足した行は null */
interface Row {
  origin: number | null;
  input: HTMLTextAreaElement;
  add: HTMLButtonElement;
  remove: HTMLButtonElement;
  item: HTMLLIElement;
}

/** 入力欄の高さを、折り返した内容がすべて見える高さに合わせる。画面に置いたあとでないと測れない */
function fitHeight(input: HTMLTextAreaElement): void {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight + 2}px`;
}

/** 行の入力欄と、その行の下に行を足す・その行を消すボタン。長い行も折り返して全部見えるよう textarea を使い、改行は入れさせない（1 つの欄が設定の 1 行） */
function makeRow(text: string, origin: number | null): Row {
  const input = el('textarea', { className: 'term-input', value: text, rows: 1, autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  input.addEventListener('input', () => {
    if (/[\r\n]/.test(input.value)) input.value = input.value.replace(/[\r\n]+/g, ' ');
    fitHeight(input);
  });
  // Tab では行から行へ移れるよう、行ごとのボタンは Tab の順に入れない（キーボードでは Enter と Backspace で同じことができる）
  const add = el('button', { type: 'button', className: 'term-button term-row-button', tabIndex: -1 }, '＋');
  const remove = el('button', { type: 'button', className: 'term-button term-row-button', tabIndex: -1 }, '×');
  return { origin, input, add, remove, item: el('li', {}, el('div', { className: 'term-edit-row' }, input, add, remove)) };
}

/**
 * 画面の行の並びから、保存する編集を作る。開いたときの行のうち、なくなった行は削除、内容が違う行は書き換え、
 * 足した行は、その上にある開いたときの行（なければ先頭）の下への追加になる
 */
function editsOf(file: EditorFile, rows: readonly Row[]): LineEdit[] {
  const kept = new Map(rows.flatMap((row) => (row.origin === null ? [] : [[row.origin, row.input.value] as const])));
  const existing = file.lines.flatMap((text, index): LineEdit[] => {
    const value = kept.get(index + 1);
    if (value === undefined) return [{ line: index + 1, remove: true }];
    return value === text ? [] : [{ line: index + 1, text: value }];
  });
  let after = 0;
  const added: LineEdit[] = [];
  for (const row of rows) {
    if (row.origin === null) added.push({ after, text: row.input.value });
    else after = row.origin;
  }
  return [...existing, ...added];
}

/** 行の並び。行を足す・消すたびに、行番号（読み上げ名）を画面の並びに合わせて付け直す */
function lineList(file: EditorFile) {
  const rows: Row[] = [];
  const list = el('ol', { className: 'term-edit-lines' });
  const first = el('button', { type: 'button', className: 'term-button' }, '＋ 先頭に行を足す');

  const renumber = () => {
    rows.forEach((row, index) => {
      row.input.ariaLabel = `${index + 1} 行目`;
      row.add.ariaLabel = `${index + 1} 行目の下に行を足す`;
      row.remove.ariaLabel = `${index + 1} 行目を消す`;
    });
  };
  /** at の位置（0 は先頭）に行を入れる */
  const insert = (at: number, text: string, origin: number | null): Row => {
    const row = makeRow(text, origin);
    row.add.addEventListener('click', () => focusNew(rows.indexOf(row) + 1));
    row.remove.addEventListener('click', () => drop(row));
    row.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        // 変換を確定する Enter では、行を足さない
        event.preventDefault();
        if (!event.isComposing) focusNew(rows.indexOf(row) + 1);
      } else if (event.key === 'Backspace' && row.input.value === '') {
        event.preventDefault();
        drop(row);
      }
    });
    list.insertBefore(row.item, rows[at]?.item ?? null);
    rows.splice(at, 0, row);
    renumber();
    return row;
  };
  const focusNew = (at: number) => {
    const row = insert(at, '', null);
    fitHeight(row.input);
    row.input.focus();
  };
  /** 行を消し、フォーカスを前の行（なければ次の行、それもなければ「先頭に行を足す」）へ移す */
  const drop = (row: Row) => {
    const at = rows.indexOf(row);
    rows.splice(at, 1);
    row.item.remove();
    renumber();
    (rows[Math.max(0, at - 1)]?.input ?? first).focus();
  };

  file.lines.forEach((text, index) => insert(index, text, index + 1));
  first.addEventListener('click', () => focusNew(0));
  return { list, first, rows };
}

/** 編集画面を作る。高さを合わせて最初の行にフォーカスを移すのは、画面に置いたあとで呼び出し側が focus で行う */
export function editorPanel(file: EditorFile, actions: EditorActions): { element: HTMLElement; focus(): void } {
  const { list, first, rows } = lineList(file);
  const message = el('p', { className: 'term-err term-edit-message', role: 'alert' });
  const saveButton = el('button', { type: 'button', className: 'term-button' }, '保存して閉じる（Ctrl+S）');
  const cancelButton = el('button', { type: 'button', className: 'term-button' }, '保存せずに閉じる（Esc）');

  const cancel = () => actions.close(`visudo: ${file.path} は変更していません（保存せずに閉じました）`);
  const save = async () => {
    const edits = editsOf(file, rows);
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
    el('p', { className: 'term-note' }, '行の右の ＋（または Enter）で下に行を足し、×（または空にした行で Backspace）でその行を消します。'),
    list,
    el('div', { className: 'term-edit-actions' }, saveButton, cancelButton, first),
    message,
  );
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
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
      rows.forEach((row) => fitHeight(row.input));
      (rows[0]?.input ?? first).focus();
    },
  };
}
