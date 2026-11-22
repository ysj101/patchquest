// 擬似シェルの画面（ターミナル）。隔離 iframe の中で動き、コマンド行を 1 行ずつ ctx.request（Host 経由）で送る。
// エディタを開くコマンド（visudo）では、入力欄の代わりに編集画面を出し、保存するときに同じコマンド行へ書き換えた行を付けて送る。
// 出力は textContent で表示し、端末のエスケープや HTML を解釈しない。キーボードだけで操作できる
import type { AppResponse } from '../../platform/contract';
import type { AppModule, ViewContext } from '../../runtimes/browser/app-module';
import { el } from '../shared/dom';
import { complete } from './completion';
import { editorPanel } from './editor-view';
import type { LineEdit } from './edits';
import type { EditorFile } from './shell';

interface Session {
  user: string;
  host: string;
  cwd: string;
  /** 名前だけで実行できるコマンドの名前（Tab キーでの補完の候補） */
  commands: string[];
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exit: number;
  cwd: string;
  /** エディタを開くコマンドのときの、開いたファイル */
  editor?: EditorFile;
}

const BADGE = '学習用の架空サーバ（ターミナル）';

function errorMessage(res: AppResponse): string {
  const body = res.body as { error?: unknown } | null;
  return typeof body?.error === 'string' ? body.error : `エラー（${res.status}）`;
}

/** 入力したコマンド行の履歴。上下の矢印キーでたどる */
function lineHistory(input: HTMLInputElement) {
  const lines: string[] = [];
  let cursor = 0;
  const show = (index: number) => {
    cursor = Math.max(0, Math.min(lines.length, index));
    input.value = lines[cursor] ?? '';
  };
  return {
    add(line: string) {
      lines.push(line);
      cursor = lines.length;
    },
    older: () => show(cursor - 1),
    newer: () => show(cursor + 1),
  };
}

/** ターミナルの画面。コマンドの入力欄と出力を持ち、エディタを開くコマンドでは入力欄の代わりに編集画面を出す */
class Terminal {
  private readonly output = el('div', { className: 'term-output', role: 'log', ariaLabel: '端末の出力', tabIndex: 0 });
  private readonly prompt = el('span', { className: 'term-prompt' });
  private readonly input = el('input', { className: 'term-input', ariaLabel: 'コマンド', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  private readonly entry = el('label', { className: 'term-entry' }, this.prompt, this.input);
  private readonly box = el('div', { className: 'terminal' }, this.output, this.entry);
  /** 端末と、その上の札。プレビューの枠の高さいっぱいに広げる */
  readonly element = el('div', { className: 'term-screen' }, el('p', { className: 'badge' }, BADGE), this.box);
  private readonly history = lineHistory(this.input);
  private cwd: string;

  constructor(private readonly ctx: ViewContext, private readonly session: Session, guide: string) {
    this.cwd = session.cwd;
    // sandbox ではフォーム送信が禁止されているため、submit ではなく Enter キーで送る
    this.input.addEventListener('keydown', (event) => this.onKey(event));
    // 端末のどこを押しても入力できるようにする（プロンプトの行や出力を押して打ち始める人が多い）。出力の文字を選んでいるときは邪魔しない
    this.box.addEventListener('click', () => {
      if (!this.entry.hidden && !this.input.disabled && window.getSelection()?.isCollapsed !== false) this.input.focus();
    });
    this.prompt.textContent = this.promptText();
    this.print('term-note', `${guide}↑↓ キーで前に入力したコマンドを呼び出せます。Tab キーでコマンド名を補完できます。`);
  }

  private promptText(): string {
    return `${this.session.user}@${this.session.host}:${this.cwd}$`;
  }

  private print(className: string, text: string): void {
    if (text !== '') this.output.append(el('pre', { className }, text));
  }

  /** 次のコマンドを受け付ける状態にする */
  private ready(): void {
    this.prompt.textContent = this.promptText();
    this.output.scrollTop = this.output.scrollHeight;
    if (!this.entry.hidden) this.input.focus();
  }

  /**
   * Tab キーで、カーソルの手前のコマンド名を補う。候補が複数あってそれ以上補えないときは、候補を端末に並べる。
   * 何も打っていないときは補わず、Tab は次の項目へ移る（キーボードだけで端末の外へ出られるようにする）
   */
  private completeWord(event: KeyboardEvent): void {
    if (event.isComposing || this.input.value.trim() === '') return;
    event.preventDefault();
    const done = complete(this.input.value, this.input.selectionStart ?? this.input.value.length, this.session.commands);
    if (!done) return;
    this.input.value = done.line;
    this.input.setSelectionRange(done.cursor, done.cursor);
    if (done.listed.length === 0) return;
    this.print('term-line', `${this.promptText()} ${done.line}`);
    this.print('term-out', done.listed.join('  '));
    this.output.scrollTop = this.output.scrollHeight;
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) return void this.completeWord(event);
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (event.key === 'ArrowUp') this.history.older();
      else this.history.newer();
      return;
    }
    // 日本語入力の変換を確定する Enter では送らない
    if (event.key !== 'Enter' || event.isComposing) return;
    const line = this.input.value;
    this.input.value = '';
    this.print('term-line', `${this.promptText()} ${line}`);
    this.output.scrollTop = this.output.scrollHeight;
    if (line.trim() === '') return;
    this.history.add(line);
    void this.run(line);
  }

  /** コマンド行を送る。コマンドを解釈できなかったとき（応答が 200 以外・送れなかった）は、理由を表示して null を返す */
  private async send(line: string, edits?: LineEdit[]): Promise<CommandResult | null> {
    try {
      const res = await this.ctx.request({ method: 'POST', path: '/sh', body: { line, cwd: this.cwd, ...(edits && { edits }) } });
      if (res.status === 200) return res.body as unknown as CommandResult;
      this.print('term-err', errorMessage(res));
    } catch (error) {
      this.print('term-err', `送れませんでした：${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }

  /** コマンド行を実行し、応答（標準出力・標準エラー・移動先）を表示する */
  private async run(line: string): Promise<void> {
    this.input.disabled = true;
    const result = await this.send(line);
    this.input.disabled = false;
    if (result) {
      this.print('term-out', result.stdout);
      this.print('term-err', result.stderr);
      this.cwd = result.cwd;
      if (result.editor) this.edit(line, result.editor);
    }
    this.ready();
  }

  /** 編集している間は、端末の出力とコマンドの入力欄を隠す（エディタが画面を占める）。行が多くて枠に収まらないときは、枠ごと縦に送れるようにする */
  private setEditing(editing: boolean): void {
    this.element.classList.toggle('term-editing', editing);
    this.output.hidden = editing;
    this.entry.hidden = editing;
  }

  /** 編集画面を、端末の出力と入力欄の代わりに出す。保存できるか、保存せずに閉じるまで、コマンドは入力できない */
  private edit(line: string, file: EditorFile): void {
    const close = (note: string) => {
      panel.element.remove();
      this.setEditing(false);
      this.print('term-note', note);
      this.ready();
    };
    const panel = editorPanel(file, {
      save: async (edits) => {
        const result = await this.send(line, edits);
        if (result === null) return 'visudo: 保存できませんでした（端末の出力を確かめてください）';
        if (result.exit !== 0) return result.stderr;
        // 本物の visudo は、保存できたときに何も出力しない。保存できたことが分かるよう、出力がなければ知らせを出す
        close(result.stdout || `${file.path} を保存しました`);
        return null;
      },
      close,
    });
    this.setEditing(true);
    this.box.append(panel.element);
    panel.focus();
  }
}

/** 端末の画面を作る。guide は、端末を開いたときに最初に出す案内のうち、アプリごとに違う部分（使えるコマンドの調べ方など） */
export function terminalView(guide: string): AppModule['render'] {
  return async (root, _route, ctx) => {
    const badge = el('p', { className: 'badge' }, BADGE);
    if (!ctx.viewer) return void root.append(badge, el('p', { className: 'muted' }, 'ログインしていません。演習画面で利用者を選んでください。'));
    const res = await ctx.request({ method: 'GET', path: '/sh' });
    if (res.status !== 200) return void root.append(badge, el('p', { className: 'error' }, errorMessage(res)));
    root.append(new Terminal(ctx, res.body as unknown as Session, guide).element);
  };
}
