// 教材ロジックと SQLite を動かす Worker。Host からの呼び出しだけを処理する
import {
  ANONYMOUS,
  RuntimeError,
  hashJson,
  type FixtureData,
  type ImplementationSelection,
  type InvokeResult,
  type JsonValue,
  type ObservedEvent,
  type PrepareOptions,
  type SessionToken,
  type ActorKey,
} from '../../platform/contract';
import type { AppModule, ServerContext } from './app-module';
import { lockdown } from './lockdown';
import type { WorkerEnvelope, WorkerReply, WorkerRequest, WorkerResult } from './protocol';
import { checkImplementation, findApp, realmOf, resolveHook } from './registry';
import { openMemoryDatabase, type Database } from './sqlite';

interface State {
  app: AppModule;
  db: Database;
  options: PrepareOptions;
  selection: ImplementationSelection;
  sessions: Map<SessionToken, ActorKey>;
}

let state: State | undefined;

async function snapshotHash(db: Database): Promise<string> {
  const tables = db.selectValues("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name") as string[];
  const dump: Record<string, JsonValue> = {};
  for (const table of tables) dump[table] = db.selectArrays(`SELECT * FROM "${table}" ORDER BY rowid`) as JsonValue;
  return hashJson(dump);
}

async function prepare(options: PrepareOptions, selection: ImplementationSelection): Promise<FixtureData> {
  const app = findApp(options.app.id, options.app.version);
  for (const [hook, implementation] of Object.entries(selection)) {
    if (realmOf(app, hook) === 'server') checkImplementation(app, hook, implementation, 'server');
  }
  const generate = app.fixtures[options.fixture.generator];
  if (!generate) throw new RuntimeError('unknown-app', `fixture ${options.fixture.generator} はありません`);

  const db = await openMemoryDatabase();
  lockdown();
  db.exec(app.schema);
  const refs = generate(db, options.fixture.seed);
  const hash = await snapshotHash(db);
  state?.db.close();
  state = { app, db, options, selection: { ...selection }, sessions: new Map() };
  return { refs, hash };
}

function requireState(): State {
  if (!state) throw new RuntimeError('not-prepared', '実行環境が準備されていません');
  return state;
}

function invoke(request: Extract<WorkerRequest, { op: 'invoke' }>['call']): InvokeResult {
  const s = requireState();
  const started = performance.now();
  const events: ObservedEvent[] = [];

  if (request.kind === 'session') {
    if (request.actor === ANONYMOUS) return { session: null, events, elapsedMs: 0 };
    if (!s.app.descriptor.users.includes(request.actor)) throw new RuntimeError('unknown-app', `利用者 ${request.actor} はいません`);
    const token = crypto.randomUUID();
    s.sessions.set(token, request.actor);
    return { session: token, events, elapsedMs: 0 };
  }

  const ctx: ServerContext = {
    db: s.db,
    principal: (request.session && s.sessions.get(request.session)) ?? null,
    hook: (id) => resolveHook(s.app, s.selection, id),
    emit: (type, data) => events.push({ type, data }),
  };
  let response;
  try {
    response = s.app.handle(ctx, request.request);
  } catch (e) {
    // 教材アプリ内の例外は基盤エラーではなく応答として返す
    const message = e instanceof Error ? e.message : String(e);
    events.push({ type: 'app.error', data: { message } });
    response = { status: 500, body: { error: message } };
  }
  return { response, events, elapsedMs: performance.now() - started };
}

async function handle(request: WorkerRequest): Promise<WorkerResult> {
  switch (request.op) {
    case 'prepare':
      return prepare(request.options, request.options.implementations);
    case 'invoke':
      return invoke(request.call);
    case 'setImplementation': {
      const s = requireState();
      checkImplementation(s.app, request.hook, request.implementation, 'server');
      s.selection[request.hook] = request.implementation;
      return null;
    }
    case 'reset': {
      const s = requireState();
      return prepare(s.options, s.selection);
    }
  }
}

self.addEventListener('message', async (e: MessageEvent<WorkerEnvelope>) => {
  const { callId, attemptId, runId, request } = e.data;
  let reply: WorkerReply;
  try {
    reply = { callId, attemptId, runId, ok: true, result: await handle(request) };
  } catch (err) {
    const code = err instanceof RuntimeError ? err.code : 'crashed';
    reply = { callId, attemptId, runId, ok: false, error: { code, message: err instanceof Error ? err.message : String(err) } };
  }
  self.postMessage(reply);
});
