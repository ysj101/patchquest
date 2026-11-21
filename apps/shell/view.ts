// 擬似シェルの画面（ターミナル）。隔離 iframe の中で動き、コマンド行を 1 行ずつ ctx.request（Host 経由）で送る。
// エディタを開くコマンド（visudo）では、入力欄の代わりに編集画面を出し、保存するときに同じコマンド行へ書き換えた行を付けて送る。
// 出力は textContent で表示し、端末のエスケープや HTML を解釈しない。キーボードだけで操作できる
import type { AppResponse } from '../../platform/contract';
import type { AppModule, ViewContext } from '../../runtimes/browser/app-module';
import { el } from '../shared/dom';
import { editorPanel } from './editor-view';
import type { EditorFile, LineEdit } from './shell';

interface Session {
  user: string;
  host: string;
  cwd: string;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exit: number;
  cwd: string;
  /** エディタを開くコマンドのときの、開いたファイル */
  editor?: EditorFile;
}

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
  readonly element = el('div', { className: 'terminal' }, this.output, this.entry);
  private readonly history = lineHistory(this.input);
  private cwd: string;

  /** note は、端末を開いたときに最初に出す案内（使えるコマンドの調べ方など。アプリごとに違う） */
  constructor(private readonly ctx: ViewContext, private readonly session: Session, note: string) {
    this.cwd = session.cwd;
    // sandbox ではフォーム送信が禁止されているため、submit ではなく Enter キーで送る
    this.input.addEventListener('keydown', (event) => this.onKey(event));
    this.prompt.textContent = this.promptText();
    this.print('term-note', note);
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

  private onKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (event.key === 'ArrowUp') this.history.older();
      else this.history.newer();
      return;
    }
    if (event.key !== 'Enter') return;
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

  /** 編集している間は、端末の出力とコマンドの入力欄を隠す（エディタが画面を占める） */
  private setEditing(editing: boolean): void {
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
        close(result.stdout);
        return null;
      },
      close,
    });
    this.setEditing(true);
    this.element.append(panel.element);
    panel.focus();
  }
}

/**
 * 端末の画面。擬似シェルと Linux 端末が共有し、端末を開いたときの最初の案内（note）だけをアプリごとに渡す。
 * 中身の違うアプリで、そのアプリでは通じない案内（例：本物のシェルでの help）を出さないため
 */
export function terminalView(note: string): AppModule['render'] {
  return async (root, _route, ctx) => {
    root.append(el('p', { className: 'badge' }, '学習用の架空サーバ（ターミナル）'));
    if (!ctx.viewer) return void root.append(el('p', { className: 'muted' }, 'ログインしていません。演習画面で利用者を選んでください。'));
    const res = await ctx.request({ method: 'GET', path: '/sh' });
    if (res.status !== 200) return void root.append(el('p', { className: 'error' }, errorMessage(res)));
    root.append(new Terminal(ctx, res.body as unknown as Session, note).element);
  };
}
