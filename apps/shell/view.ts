// 擬似シェルの画面（ターミナル）。隔離 iframe の中で動き、コマンド行を 1 行ずつ ctx.request（Host 経由）で送る。
// 出力は textContent で表示し、端末のエスケープや HTML を解釈しない。キーボードだけで操作できる
import type { AppResponse } from '../../platform/contract';
import type { ViewContext } from '../../runtimes/browser/app-module';
import { el } from '../shared/dom';

interface Session {
  user: string;
  host: string;
  cwd: string;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  cwd: string;
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

function terminal(ctx: ViewContext, session: Session): HTMLElement {
  let cwd = session.cwd;
  const output = el('div', { className: 'term-output', role: 'log', ariaLabel: '端末の出力', tabIndex: 0 });
  const prompt = el('span', { className: 'term-prompt' });
  const input = el('input', { className: 'term-input', ariaLabel: 'コマンド', autocomplete: 'off', autocapitalize: 'off', spellcheck: false });
  const history = lineHistory(input);
  const promptText = () => `${session.user}@${session.host}:${cwd}$`;
  const print = (className: string, text: string) => {
    if (text !== '') output.append(el('pre', { className }, text));
  };

  /** コマンド行を送り、応答（標準出力・標準エラー・移動先）を表示する */
  const run = async (line: string) => {
    input.disabled = true;
    try {
      const res = await ctx.request({ method: 'POST', path: '/sh', body: { line, cwd } });
      if (res.status !== 200) return void print('term-err', errorMessage(res));
      const result = res.body as unknown as CommandResult;
      print('term-out', result.stdout);
      print('term-err', result.stderr);
      cwd = result.cwd;
    } catch (error) {
      print('term-err', `送れませんでした：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      input.disabled = false;
      prompt.textContent = promptText();
      output.scrollTop = output.scrollHeight;
      input.focus();
    }
  };

  // sandbox ではフォーム送信が禁止されているため、submit ではなく Enter キーで送る
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (event.key === 'ArrowUp') history.older();
      else history.newer();
      return;
    }
    if (event.key !== 'Enter') return;
    const line = input.value;
    input.value = '';
    print('term-line', `${promptText()} ${line}`);
    output.scrollTop = output.scrollHeight;
    if (line.trim() === '') return;
    history.add(line);
    void run(line);
  });

  prompt.textContent = promptText();
  print('term-note', 'help と入力すると、使えるコマンドを表示します。↑↓ キーで前に入力したコマンドを呼び出せます。');
  return el('div', { className: 'terminal' }, output, el('label', { className: 'term-entry' }, prompt, input));
}

export async function render(root: HTMLElement, _route: string, ctx: ViewContext): Promise<void> {
  root.append(el('p', { className: 'badge' }, '学習用の架空サーバ（ターミナル）'));
  if (!ctx.viewer) return void root.append(el('p', { className: 'muted' }, 'ログインしていません。演習画面で利用者を選んでください。'));
  const res = await ctx.request({ method: 'GET', path: '/sh' });
  if (res.status !== 200) return void root.append(el('p', { className: 'error' }, errorMessage(res)));
  root.append(terminal(ctx, res.body as unknown as Session));
}
