// 教材ロジックの実行エンジン。Worker の中で動かすほか、Node のユニットテストからも直接使う
import {
  ANONYMOUS,
  RuntimeError,
  hashJson,
  type ActorKey,
  type FixtureData,
  type HookId,
  type ImplementationId,
  type ImplementationSelection,
  type InvokeCall,
  type InvokeResult,
  type JsonValue,
  type ObservedEvent,
  type PrepareOptions,
  type SessionToken,
} from '../../platform/contract';
import type { AppModule, ServerContext } from './app-module';
import { checkImplementation, findApp, resolveHook, splitByRealm } from './registry';
import { openMemoryDatabase, type Database } from './sqlite';

interface State {
  app: AppModule;
  db: Database;
  options: PrepareOptions;
  selection: ImplementationSelection;
  sessions: Map<SessionToken, ActorKey>;
}

async function snapshotHash(db: Database): Promise<string> {
  const tables = db.selectValues("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name") as string[];
  const dump: Record<string, JsonValue> = {};
  for (const table of tables) dump[table] = db.selectArrays(`SELECT * FROM "${table}" ORDER BY rowid`) as JsonValue;
  return hashJson(dump);
}

export class AppEngine {
  private state: State | undefined;

  /** fixture と seed から初期データを作る。server のフックの実装だけを保持する */
  async prepare(options: PrepareOptions, selection: ImplementationSelection = options.implementations): Promise<FixtureData> {
    const app = findApp(options.app.id, options.app.version);
    const { server } = splitByRealm(app, selection);
    const generate = app.fixtures[options.fixture.generator];
    if (!generate) throw new RuntimeError('unknown-app', `fixture ${options.fixture.generator} はありません`);

    const db = await openMemoryDatabase();
    db.exec(app.schema);
    const refs = generate(db, options.fixture.seed);
    const hash = await snapshotHash(db);
    this.state?.db.close();
    this.state = { app, db, options, selection: server, sessions: new Map() };
    return { refs, hash };
  }

  /** 実装の選択を保ったまま、同じ fixture と seed で初期データを作り直す。セッションは失効する */
  reset(): Promise<FixtureData> {
    const s = this.require();
    return this.prepare(s.options, s.selection);
  }

  setImplementation(hook: HookId, implementation: ImplementationId): void {
    const s = this.require();
    checkImplementation(s.app, hook, implementation, 'server');
    s.selection[hook] = implementation;
  }

  invoke(call: Exclude<InvokeCall, { kind: 'render' }>): InvokeResult {
    const s = this.require();
    const started = performance.now();
    const events: ObservedEvent[] = [];

    if (call.kind === 'session') {
      if (call.actor === ANONYMOUS) return { session: null, events, elapsedMs: 0 };
      if (!s.app.descriptor.users.includes(call.actor)) throw new RuntimeError('unknown-app', `利用者 ${call.actor} はいません`);
      const token = crypto.randomUUID();
      s.sessions.set(token, call.actor);
      return { session: token, events, elapsedMs: 0 };
    }

    const ctx: ServerContext = {
      db: s.db,
      // 主体はセッションからだけ決まる。不明なセッションは未ログインとして扱う
      principal: (call.session && s.sessions.get(call.session)) ?? null,
      hook: (id) => resolveHook(s.app, s.selection, id),
      emit: (type, data) => events.push({ type, data }),
    };
    let response;
    try {
      response = s.app.handle(ctx, call.request);
    } catch (e) {
      // 教材アプリ内の例外は基盤エラーではなく応答として返す
      const message = e instanceof Error ? e.message : String(e);
      events.push({ type: 'app.error', data: { message } });
      response = { status: 500, body: { error: message } };
    }
    return { response, events, elapsedMs: performance.now() - started };
  }

  private require(): State {
    if (!this.state) throw new RuntimeError('not-prepared', '実行環境が準備されていません');
    return this.state;
  }
}
