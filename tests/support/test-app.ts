// RuntimeAdapter と基盤の検証専用の小さな教材アプリ。配布物には含めない
import type { AppRequest, AppResponse, JsonValue } from '../../platform/contract';
import type { AppModule, ServerContext, ViewContext } from '../../runtimes/browser/app-module';

type Note = { id: number; owner: string; body: string };
export type ReadNote = (ctx: ServerContext, note: Note | null) => Note | 'forbidden' | null;
export type RenderNote = (el: HTMLElement, body: string) => void;

/** 決定的な疑似乱数（mulberry32） */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function json(status: number, body: JsonValue): AppResponse {
  return { status, body };
}

function handle(ctx: ServerContext, req: AppRequest): AppResponse {
  const [, resource, id] = req.path.split('/');
  if (req.method === 'GET' && req.path === '/notes') {
    if (!ctx.principal) return json(401, { error: 'login required' });
    const sql = 'SELECT id, owner, body FROM notes WHERE owner = ? ORDER BY id';
    const rows = ctx.db.selectObjects(sql, [ctx.principal]) as Note[];
    ctx.emit('sql.query', { sql, bind: [ctx.principal], owners: [...new Set(rows.map((r) => r.owner))] });
    return json(200, { notes: rows });
  }
  if (req.method === 'POST' && req.path === '/notes') {
    if (!ctx.principal) return json(401, { error: 'login required' });
    const body = (req.body as { body?: unknown } | undefined)?.body;
    if (typeof body !== 'string') return json(400, { error: 'body required' });
    ctx.db.exec({ sql: 'INSERT INTO notes (owner, body) VALUES (?, ?)', bind: [ctx.principal, body] });
    return json(201, { id: ctx.db.selectValue('SELECT last_insert_rowid()') as number });
  }
  if (req.method === 'GET' && resource === 'notes' && id) {
    const note = (ctx.db.selectObject('SELECT id, owner, body FROM notes WHERE id = ?', [Number(id)]) as Note | undefined) ?? null;
    const result = ctx.hook<ReadNote>('note.read')(ctx, note);
    if (result === 'forbidden') return json(403, { error: 'forbidden' });
    return result ? json(200, { note: result }) : json(404, { error: 'not found' });
  }
  if (req.path === '/slow') for (;;);
  if (req.path === '/crash') throw new Error('boom');
  if (req.path === '/probe/storage') {
    const tried: Record<string, string> = {};
    for (const [name, attempt] of Object.entries({
      indexedDB: () => indexedDB.open('pq'),
      fetch: () => fetch('/'),
    })) {
      try {
        attempt();
        tried[name] = 'allowed';
      } catch {
        tried[name] = 'blocked';
      }
    }
    return json(200, tried);
  }
  return json(404, { error: 'not found' });
}

async function render(root: HTMLElement, route: string, ctx: ViewContext): Promise<void> {
  const heading = document.createElement('h1');
  heading.textContent = `ノート（${ctx.viewer ?? '未ログイン'}）`;
  root.append(heading);
  if (route !== '/notes') return;
  const res = await ctx.request({ method: 'GET', path: '/notes' });
  const list = document.createElement('ul');
  for (const note of (res.body as { notes?: Note[] }).notes ?? []) {
    const li = document.createElement('li');
    ctx.hook<RenderNote>('note.render')(li, note.body);
    list.append(li);
  }
  root.append(list);
}

export const testApp: AppModule = {
  descriptor: {
    id: 'test-app',
    version: '1.0.0',
    features: ['notes'],
    users: ['alice', 'bob'],
    hooks: [
      { id: 'note.read', realm: 'server', contract: 1, baseline: 'test-app/owner-only', description: 'ID 指定でノートを読む' },
      { id: 'note.render', realm: 'view', contract: 1, baseline: 'test-app/text', description: 'ノート本文を描画する' },
    ],
  },
  schema: 'CREATE TABLE notes (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, body TEXT NOT NULL);',
  fixtures: {
    'test.default': (db, seed) => {
      const next = random(seed);
      const secret = `alice-secret-${Math.floor(next() * 1e6)}`;
      const offset = 1 + Math.floor(next() * 50);
      db.exec({ sql: 'INSERT INTO notes (id, owner, body) VALUES (?, ?, ?), (?, ?, ?)', bind: [offset, 'alice', secret, offset + 1, 'bob', 'bob-note'] });
      return { 'notes.alice.id': offset, 'notes.alice.body': secret, 'notes.bob.id': offset + 1 };
    },
  },
  implementations: {
    'test-app/owner-only': { hook: 'note.read', run: ((ctx, note) => (note && note.owner !== ctx.principal ? 'forbidden' : note)) satisfies ReadNote },
    'test-app/text': { hook: 'note.render', run: ((el, body) => void (el.textContent = body)) satisfies RenderNote },
  },
  handle,
  render,
};
