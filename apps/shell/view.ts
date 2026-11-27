// 擬似シェルの画面（ターミナル）。隔離 iframe の中で動き、コマンド行を 1 行ずつ ctx.request（Host 経由）で送る。
// エディタを開くコマンド（visudo・sudoedit）では、入力欄の代わりに編集画面を出し、保存するときに同じコマンド行へ書き換えた行を付けて送る。
// 利用者の表示を切り替えて戻ったときは、その利用者の端末（出力・入力の履歴）をそのまま出し直す。
// 端末の使い方は、最初から出力に並べず、札の横の「端末の使い方」を開いたときだけ見せる。
// 出力は textContent で表示し、端末のエスケープや HTML を解釈しない。キーボードだけで操作できる
import type { AppResponse } from '../../platform/contract';
import type { AppModule, ViewContext } from '../../runtimes/browser/app-module';
import { el } from '../shared/dom';
import { complete, completeName, nameDir, type Completion } from './completion';
import { editorPanel } from './editor-view';
import type { LineEdit } from './edits';
import { NAMES_PATH, type EditorFile } from './shell';

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
/** 端末の画面そのものの使い方（どのアプリでも同じ）。アプリごとの案内のあとに並べる */
const KEY_GUIDE = ['↑↓ キーで前に入力したコマンドを呼び出せます。', 'Tab キーでコマンド名とファイル名を補完できます。'];

/** 端末の使い方と、それを開け閉めするボタン。閉じた状態で置き、困ったときだけ開く（開いている間は、そのぶん端末が縮む） */
function helpPanel(guide: readonly string[]): HTMLElement[] {
  const list = el('ul', { className: 'term-help', id: 'term-help', hidden: true }, ...[...guide, ...KEY_GUIDE].map((line) => el('li', {}, line)));
  const toggle = el('button', { type: 'button', className: 'link', ariaExpanded: 'false' }, '端末の使い方');
  toggle.setAttribute('aria-controls', list.id);
  toggle.addEventListener('click', () => {
    list.hidden = !list.hidden;
    toggle.ariaExpanded = String(!list.hidden);
  });
  return [toggle, list];
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
  private readonly box = el('div', { className: 'terminal' }, this.output, this.entry);
  /** 端末と、その上の札・端末の使い方。プレビューの枠の高さいっぱいに広げる */
  readonly element: HTMLElement;
  private readonly history = lineHistory(this.input);
  private cwd: string;
  /**
   * 端末の状態。docs/formal/Terminal.tla が検査する。
   * prompt: コマンドを受け付けている / running: コマンドを送って応答を待っている（入力できない） /
   * editing: 編集画面が端末の出力と入力欄の代わりに出ている（保存できるか、保存せずに閉じるまで、コマンドは入力できない）
   */
  private mode: 'prompt' | 'running' | 'editing' = 'prompt';

  constructor(private ctx: ViewContext, private readonly session: Session, guide: readonly string[]) {
    this.element = el('div', { className: 'term-screen' }, el('div', { className: 'term-head' }, el('p', { className: 'badge' }, BADGE), ...helpPanel(guide)), this.box);
    this.cwd = session.cwd;
    // sandbox ではフォーム送信が禁止されているため、submit ではなく Enter キーで送る
    this.input.addEventListener('keydown', (event) => this.onKey(event));
    // 端末のどこを押しても入力できるようにする（プロンプトの行や出力を押して打ち始める人が多い）。出力の文字を選んでいるときは邪魔しない
    this.box.addEventListener('click', () => {
      if (this.mode === 'prompt' && window.getSelection()?.isCollapsed !== false) this.input.focus();
    });
    this.prompt.textContent = this.promptText();
  }

  /**
   * 描き直された画面へ、同じ端末を出し直す。それまでの出力・入力の履歴・作業ディレクトリ・開いている編集画面はそのまま残す。
   * 呼び出しは新しい描画の ctx で送る（前の描画の ctx で送った呼び出しは、Host が破棄する）
   */
  reopen(ctx: ViewContext, root: HTMLElement): void {
    this.ctx = ctx;
    root.append(this.element);
    // 画面から外れている間に、出力の欄の送り位置は先頭へ戻る
    this.output.scrollTop = this.output.scrollHeight;
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
    if (this.mode === 'prompt') this.input.focus();
  }

  /** カーソルの手前の語を、ファイル名として補う。その場所にある名前を、教材アプリに尋ねる。補完の対象でないとき・尋ねられなかったときは null */
  private async completeFileName(line: string, cursor: number): Promise<Completion | null> {
    const dir = nameDir(line, cursor, this.cwd);
    if (dir === null) return null;
    try {
      const res = await this.ctx.request({ method: 'POST', path: NAMES_PATH, body: { dir } });
      if (res.status === 200) return completeName(line, cursor, (res.body as { names: string[] }).names);
      this.print('term-err', errorMessage(res));
    } catch (error) {
      this.print('term-err', `補完の候補を調べられませんでした：${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }

  /**
   * Tab キーで、カーソルの手前のコマンド名かファイル名を補う。候補が複数あってそれ以上補えないときは、候補を端末に並べる。
   * 何も打っていないときは補わず、Tab は次の項目へ移る（キーボードだけで端末の外へ出られるようにする）
   */
  private async completeWord(event: KeyboardEvent): Promise<void> {
    if (event.isComposing || this.input.value.trim() === '') return;
    event.preventDefault();
    const line = this.input.value;
    const cursor = this.input.selectionStart ?? line.length;
    const done = complete(line, cursor, this.session.commands) ?? (await this.completeFileName(line, cursor));
    // 名前を尋ねている間に入力が変わっていたら（打ち足した・実行した）、補わない
    if (!done || this.input.value !== line || this.input.selectionStart !== cursor) return;
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
    this.setMode('running');
    const result = await this.send(line);
    this.setMode('prompt');
    if (result) {
      this.print('term-out', result.stdout);
      this.print('term-err', result.stderr);
      this.cwd = result.cwd;
      if (result.editor) this.edit(line, result.editor);
    }
    this.ready();
  }

  /**
   * 状態を切り替え、画面をそれに合わせる。応答を待つ間は入力欄を止める。
   * 編集している間は、端末の出力とコマンドの入力欄を隠す（エディタが画面を占める）。行が多くて枠に収まらないときは、枠ごと縦に送れるようにする
   */
  private setMode(mode: Terminal['mode']): void {
    this.mode = mode;
    this.input.disabled = mode === 'running';
    this.element.classList.toggle('term-editing', mode === 'editing');
    this.output.hidden = mode === 'editing';
    this.entry.hidden = mode === 'editing';
  }

  /** 編集画面を、端末の出力と入力欄の代わりに出す。保存できるか、保存せずに閉じるまで、コマンドは入力できない */
  private edit(line: string, file: EditorFile): void {
    const close = (note: string) => {
      panel.element.remove();
      this.setMode('prompt');
      this.print('term-note', note);
      this.ready();
    };
    const tool = editorTool(line);
    const panel = editorPanel(tool, file, {
      save: async (edits) => {
        const result = await this.send(line, edits);
        if (result === null) return `${tool}: 保存できませんでした（端末の出力を確かめてください）`;
        if (result.exit !== 0) return result.stderr;
        // 本物の visudo と sudoedit は、保存できたときに何も出力しない。保存できたことが分かるよう、出力がなければ知らせを出す
        close(result.stdout || `${file.path} を保存しました`);
        return null;
      },
      close,
    });
    this.setMode('editing');
    this.box.append(panel.element);
    panel.focus();
  }
}

/** 編集画面を開いたコマンドの名前。編集画面の案内と知らせに使う（sudoedit は、本物の Linux の端末でだけ開く） */
function editorTool(line: string): string {
  return /(?:^|[\s/])visudo(?:\s|$)/.test(line) ? 'visudo' : 'sudoedit';
}

/**
 * 利用者ごとの端末。プレビューは利用者の表示を切り替えるたびに描き直されるので、ここに残しておき、戻ってきたときに同じ端末を出し直す。
 * 教材データが用意し直されたら（別の演習を始めた・最初の状態に戻した）、前のデータのときの端末は捨てる
 */
const opened = { dataGeneration: -1, terminals: new Map<string, Terminal>() };

/** 端末の画面を作る。guide は、「端末の使い方」に並べる案内のうち、アプリごとに違う部分（使えるコマンドの調べ方など）。1 文ずつ渡す */
export function terminalView(guide: readonly string[]): AppModule['render'] {
  return async (root, _route, ctx) => {
    const badge = el('p', { className: 'badge' }, BADGE);
    if (!ctx.viewer) return void root.append(badge, el('p', { className: 'muted' }, 'ログインしていません。演習画面で利用者を選んでください。'));
    const res = await ctx.request({ method: 'GET', path: '/sh' });
    if (res.status !== 200) return void root.append(badge, el('p', { className: 'error' }, errorMessage(res)));
    if (opened.dataGeneration !== ctx.dataGeneration) {
      opened.terminals.clear();
      opened.dataGeneration = ctx.dataGeneration;
    }
    const terminal = opened.terminals.get(ctx.viewer);
    if (terminal) return void terminal.reopen(ctx, root);
    const created = new Terminal(ctx, res.body as unknown as Session, guide);
    opened.terminals.set(ctx.viewer, created);
    root.append(created.element);
  };
}
