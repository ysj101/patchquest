// sudo の設定（sudoers）の読み取りと判断のモデル。扱うのは「誰が・誰として・どのコマンドを・パスワードなしで」の表だけで、
// 別名（Alias）・Defaults・否定（!）・ホストの指定には対応しない。対応しない書き方は構文エラーにする
export interface SudoEntry {
  /** 利用者名、または % で始まるグループ名 */
  who: string;
  /** 誰として実行できるか。利用者名か ALL */
  runAs: string;
  nopasswd: boolean;
  /** 絶対パス、または ALL */
  commands: string[];
  line: number;
}

export interface SudoersError {
  line: number;
  message: string;
}

const WHO = /^%?[a-z_][a-z0-9_-]*$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const COMMAND = /^\/[A-Za-z0-9_./-]+$/;
const NOPASSWD = 'NOPASSWD:';

/** = の右側（(実行する利用者) NOPASSWD: コマンド, ...）を読む。読めなければ理由を返す */
function parseGrant(spec: string): Pick<SudoEntry, 'runAs' | 'nopasswd' | 'commands'> | { error: string } {
  let rest = spec.trim();
  let runAs = 'root';
  if (rest.startsWith('(')) {
    const close = rest.indexOf(')');
    if (close < 0) return { error: '( が閉じていません' };
    runAs = rest.slice(1, close).trim();
    if (!NAME.test(runAs)) return { error: `実行する利用者「${runAs}」を読めません` };
    rest = rest.slice(close + 1).trim();
  }
  const nopasswd = rest.startsWith(NOPASSWD);
  if (nopasswd) rest = rest.slice(NOPASSWD.length);
  const commands = rest.split(',').map((command) => command.trim());
  const bad = commands.find((command) => command !== 'ALL' && !COMMAND.test(command));
  if (bad !== undefined) return { error: bad === '' ? 'コマンドがありません' : `コマンド「${bad}」は絶対パスか ALL で書いてください` };
  return { runAs, nopasswd, commands };
}

function parseEntry(text: string, line: number): SudoEntry | { error: string } {
  const equals = text.indexOf('=');
  if (equals < 0) return { error: '「利用者 ALL=(実行する利用者) コマンド」の形ではありません' };
  const subject = text.slice(0, equals).trim().split(/\s+/);
  const [who, host] = subject;
  if (subject.length !== 2 || who === undefined || !WHO.test(who)) return { error: '利用者（または %グループ）を読めません' };
  if (host !== 'ALL') return { error: 'ホストは ALL だけに対応しています' };
  const grant = parseGrant(text.slice(equals + 1));
  return 'error' in grant ? grant : { who, line, ...grant };
}

/** sudoers の本文を読む。空行と # で始まる行は読み飛ばす。読めない行は errors に入れ、entries には入れない */
export function parseSudoers(text: string): { entries: SudoEntry[]; errors: SudoersError[] } {
  const entries: SudoEntry[] = [];
  const errors: SudoersError[] = [];
  text.split('\n').forEach((raw, index) => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    const entry = parseEntry(trimmed, index + 1);
    if ('error' in entry) errors.push({ line: index + 1, message: entry.error });
    else entries.push(entry);
  });
  return { entries, errors };
}

/** この利用者に当てはまる設定（利用者名か、所属するグループ） */
export function entriesFor<E extends SudoEntry>(entries: readonly E[], account: { name: string; groups: readonly string[] }): E[] {
  return entries.filter((entry) => (entry.who.startsWith('%') ? account.groups.includes(entry.who.slice(1)) : entry.who === account.name));
}

/**
 * コマンドを root として実行してよいかを決める。本物の sudo と同じく、当てはまる設定のうち最後のものが効く。
 * 当てはまる設定がなければ undefined
 */
export function decide<E extends SudoEntry>(entries: readonly E[], account: { name: string; groups: readonly string[] }, command: string): E | undefined {
  return entriesFor(entries, account)
    .filter((entry) => (entry.runAs === 'root' || entry.runAs === 'ALL') && (entry.commands.includes('ALL') || entry.commands.includes(command)))
    .at(-1);
}

/** sudo -l に出す 1 行 */
export function describeEntry(entry: SudoEntry): string {
  return `    (${entry.runAs}) ${entry.nopasswd ? 'NOPASSWD: ' : ''}${entry.commands.join(', ')}`;
}
