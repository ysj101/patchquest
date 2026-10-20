// 参考コードをキーワード・文字列・コメントの印へ分ける。
import type { ReferenceDiff } from '../contract';

export type MarkedKind = 'keyword' | 'string' | 'comment';

export interface TextToken {
  kind: 'text';
  text: string;
}

export interface MarkedToken {
  kind: MarkedKind;
  text: string;
}

export type CodeToken = TextToken | MarkedToken;

type Language = ReferenceDiff['language'];

interface ScanRules {
  keywords: ReadonlySet<string>;
  ignoreCase: boolean;
  lineComments: readonly string[];
  blockComments: readonly (readonly [string, string])[];
  quotes: readonly string[];
  doubledQuotes: boolean;
  templates: boolean;
}

interface Slice {
  tokens: CodeToken[];
  next: number;
}

const TS_KEYWORDS = new Set(
  'as async await break case catch class const continue delete else enum export extends false finally for from function if implements import in instanceof interface is let new null of private protected public readonly return static switch this throw true try type typeof undefined var void while yield'.split(' '),
);

const SQL_KEYWORDS = new Set(
  'all and as asc between by case create delete desc distinct else end escape exists from group having in inner insert into is join key left like limit not null offset on or order outer primary right select set table then union update values when where'.split(' '),
);

const TYPESCRIPT_RULES: ScanRules = {
  keywords: TS_KEYWORDS,
  ignoreCase: false,
  lineComments: ['//'],
  blockComments: [['/*', '*/']],
  quotes: ['"', "'"],
  doubledQuotes: false,
  templates: true,
};

const SQL_RULES: ScanRules = {
  keywords: SQL_KEYWORDS,
  ignoreCase: true,
  lineComments: ['--'],
  blockComments: [['/*', '*/']],
  quotes: ["'", '"'],
  doubledQuotes: true,
  templates: false,
};

const CODE_RULES = { ts: TYPESCRIPT_RULES, sql: SQL_RULES } as const satisfies Record<Exclude<Language, 'html'>, ScanRules>;

/** 印の text を順に連結すると source に戻る。 */
export function highlightSource(language: Language, source: string): CodeToken[] {
  if (language === 'html') return coalesce(scanHtml(source));
  return coalesce(scanCode(source, CODE_RULES[language]));
}

function coalesce(tokens: readonly CodeToken[]): CodeToken[] {
  const merged: CodeToken[] = [];
  for (const token of tokens) {
    const last = merged.at(-1);
    if (last?.kind === token.kind) merged[merged.length - 1] = { kind: last.kind, text: last.text + token.text };
    else merged.push(token);
  }
  return merged;
}

function scanCode(source: string, rules: ScanRules): CodeToken[] {
  const tokens: CodeToken[] = [];
  let index = 0;
  while (index < source.length) {
    const slice = readOne(source, index, rules);
    tokens.push(...slice.tokens);
    index = slice.next;
  }
  return tokens;
}

function readOne(source: string, index: number, rules: ScanRules): Slice {
  const comment = readComment(source, index, rules);
  if (comment) return comment;
  const literal = readString(source, index, rules);
  if (literal) return literal;
  const word = readWord(source, index, rules);
  if (word) return word;
  return { tokens: [{ kind: 'text', text: source.slice(index, index + 1) }], next: index + 1 };
}

function readComment(source: string, index: number, rules: ScanRules): Slice | null {
  for (const [open, close] of rules.blockComments) {
    if (!source.startsWith(open, index)) continue;
    const end = source.indexOf(close, index + open.length);
    const next = end < 0 ? source.length : end + close.length;
    return { tokens: [{ kind: 'comment', text: source.slice(index, next) }], next };
  }
  for (const open of rules.lineComments) {
    if (!source.startsWith(open, index)) continue;
    const end = source.indexOf('\n', index);
    const next = end < 0 ? source.length : end;
    return { tokens: [{ kind: 'comment', text: source.slice(index, next) }], next };
  }
  return null;
}

function readString(source: string, index: number, rules: ScanRules): Slice | null {
  const quote = rules.quotes.find((item) => source.startsWith(item, index));
  if (quote) return quotedSlice(source, index, quote, rules.doubledQuotes);
  if (rules.templates && source.startsWith('`', index)) return readTemplate(source, index, rules);
  return null;
}

function quotedSlice(source: string, index: number, quote: string, doubledQuotes: boolean): Slice {
  const quoted = readQuoted(source, index, quote, doubledQuotes);
  return { tokens: [{ kind: 'string', text: quoted.text }], next: quoted.next };
}

function readQuoted(source: string, index: number, quote: string, doubledQuotes: boolean): { text: string; next: number } {
  let cursor = index + quote.length;
  while (cursor < source.length) {
    if (source.startsWith('\\', cursor)) {
      cursor += 2;
      continue;
    }
    if (doubledQuotes && source.startsWith(quote + quote, cursor)) {
      cursor += quote.length * 2;
      continue;
    }
    if (source.startsWith(quote, cursor)) return { text: source.slice(index, cursor + quote.length), next: cursor + quote.length };
    cursor += 1;
  }
  return { text: source.slice(index), next: source.length };
}

function readTemplate(source: string, index: number, rules: ScanRules): Slice {
  const tokens: CodeToken[] = [];
  let cursor = index + 1;
  let chunk = '`';
  while (cursor < source.length) {
    if (source.startsWith('\\', cursor)) {
      chunk += source.slice(cursor, cursor + 2);
      cursor += 2;
      continue;
    }
    if (source.startsWith('`', cursor)) return { tokens: [...tokens, { kind: 'string', text: `${chunk}\`` }], next: cursor + 1 };
    if (source.startsWith('${', cursor)) {
      tokens.push({ kind: 'string', text: `${chunk}\${` });
      const inner = readInterpolation(source, cursor + 2, rules);
      tokens.push(...inner.tokens);
      chunk = source.startsWith('}', inner.next) ? '}' : '';
      cursor = inner.next + (chunk.length > 0 ? 1 : 0);
      continue;
    }
    chunk += source[cursor] ?? '';
    cursor += 1;
  }
  return { tokens: [...tokens, { kind: 'string', text: chunk }], next: source.length };
}

function readInterpolation(source: string, index: number, rules: ScanRules): Slice {
  const tokens: CodeToken[] = [];
  let cursor = index;
  let depth = 1;
  while (cursor < source.length && depth > 0) {
    if (source.startsWith('{', cursor)) {
      depth += 1;
      tokens.push({ kind: 'text', text: '{' });
      cursor += 1;
      continue;
    }
    if (source.startsWith('}', cursor)) {
      depth -= 1;
      if (depth === 0) return { tokens, next: cursor };
      tokens.push({ kind: 'text', text: '}' });
      cursor += 1;
      continue;
    }
    const slice = readOne(source, cursor, rules);
    tokens.push(...slice.tokens);
    cursor = slice.next;
  }
  return { tokens, next: cursor };
}

function readWord(source: string, index: number, rules: ScanRules): Slice | null {
  const first = source[index] ?? '';
  if (!/[A-Za-z_$]/.test(first)) return null;
  let cursor = index + 1;
  while (cursor < source.length && /[A-Za-z0-9_$]/.test(source[cursor] ?? '')) cursor += 1;
  const text = source.slice(index, cursor);
  const key = rules.ignoreCase ? text.toLowerCase() : text;
  return { tokens: [{ kind: rules.keywords.has(key) ? 'keyword' : 'text', text }], next: cursor };
}

function scanHtml(source: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      const next = end < 0 ? source.length : end + 3;
      tokens.push({ kind: 'comment', text: source.slice(index, next) });
      index = next;
      continue;
    }
    if (source.startsWith('<', index)) {
      const tag = readTag(source, index);
      tokens.push(...tag.tokens);
      index = tag.next;
      continue;
    }
    const next = source.indexOf('<', index);
    const end = next < 0 ? source.length : next;
    tokens.push({ kind: 'text', text: source.slice(index, end) });
    index = end;
  }
  return tokens;
}

function readTag(source: string, index: number): Slice {
  const tokens: CodeToken[] = [{ kind: 'text', text: '<' }];
  let cursor = index + 1;
  if (source.startsWith('/', cursor)) {
    tokens.push({ kind: 'text', text: '/' });
    cursor += 1;
  }
  const name = readHtmlName(source, cursor);
  if (name.text.length > 0) tokens.push({ kind: 'keyword', text: name.text });
  cursor = name.next;
  while (cursor < source.length && !source.startsWith('>', cursor)) {
    const quote = source[cursor] === '"' || source[cursor] === "'" ? source[cursor] : '';
    if (quote) {
      const quoted = readQuoted(source, cursor, quote, false);
      tokens.push({ kind: 'string', text: quoted.text });
      cursor = quoted.next;
      continue;
    }
    tokens.push({ kind: 'text', text: source[cursor] ?? '' });
    cursor += 1;
  }
  if (source.startsWith('>', cursor)) {
    tokens.push({ kind: 'text', text: '>' });
    cursor += 1;
  }
  return { tokens, next: cursor };
}

function readHtmlName(source: string, index: number): { text: string; next: number } {
  let cursor = index;
  while (cursor < source.length && /[A-Za-z0-9:_-]/.test(source[cursor] ?? '')) cursor += 1;
  return { text: source.slice(index, cursor), next: cursor };
}
