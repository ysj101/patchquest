// 教材ロジックの実行エンジン。Worker の中で動かすほか、Node のユニットテストからも直接使う
import {
  ANONYMOUS,
  RuntimeError,
  errorMessage,
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
import { Machine, type AssetLoader } from './machine';
import { REGEX_ASSET, RegexEngine } from './regex';
import { checkImplementation, findApp, resolveHook, splitByRealm } from './registry';
import { openMemoryDatabase, type Database } from './sqlite';

/** 動いている機械と、反映した初期データ（アプリと hash） */
interface Running {
  machine: Machine;
  key: string;
}

interface State {
  app: AppModule;
  db: Database;
  /** 演習用の機械。使わないアプリでは持たない */
  machine: Running | undefined;
  /** 正規表現エンジン（PCRE2）。使わないアプリでは持たない */
  regex: RegexEngine | undefined;
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
  /** 準備が済んでいれば、その中身。準備の前・準備に失敗したあと・破棄したあとは undefined（呼び出しは not-prepared で断る） */
  private state: State | undefined;
  /**
   * 準備・初期化・破棄は 1 件ずつ順に行う。重ねると、前の準備が起動した機械を知らずにもう 1 台起動して止め忘れたり、
   * 先に頼んだ準備の結果が、あとに頼んだ準備の結果を上書きしたりする。docs/formal/Engine.tla が検査する
   */
  private lifecycle: Promise<unknown> = Promise.resolve();

  /** 一度読んだ正規表現エンジンの配布物。Worker では、通信を塞いだあとの作り直し（リセット）でも使えるようにする */
  private regexAsset: Promise<ArrayBuffer> | undefined;

  /** loadAsset は、演習用の機械と正規表現エンジンの配布物を読む手段。それらを使うアプリを動かすときに要る */
  constructor(private readonly loadAsset?: AssetLoader) {}

  /** fixture と seed から初期データを作る。server のフックの実装だけを保持する */
  prepare(options: PrepareOptions, selection: ImplementationSelection = options.implementations): Promise<FixtureData> {
    return this.inTurn(() => this.build(options, selection));
  }

  /** 前に頼まれた準備・初期化・破棄が終わってから実行する */
  private inTurn<T>(work: () => Promise<T>): Promise<T> {
    const result = this.lifecycle.then(work);
    this.lifecycle = result.catch(() => undefined);
    return result;
  }

  private async build(options: PrepareOptions, selection: ImplementationSelection): Promise<FixtureData> {
    const app = findApp(options.app.id, options.app.version);
    const { server } = splitByRealm(app, selection);
    const generate = app.fixtures[options.fixture.generator];
    if (!generate) throw new RuntimeError('unknown-app', `fixture ${options.fixture.generator} はありません`);

    // 照合のたびに使うメモリを前の演習から引き継がないよう、準備のたびに新しい実体を作る
    const regex = app.regex ? await this.regexFor(app.regex.matchLimit) : undefined;
    const db = await openMemoryDatabase();
    db.exec(app.schema);
    // 生成器には server のフックの現在の実装を渡す。レシピが注入した実装なら、初期データに問題が仕込まれる
    const refs = generate(db, options.fixture.seed, (id) => resolveHook(app, server, id));
    const hash = await snapshotHash(db);
    const previous = this.state;
    // 機械の用意に失敗したら、止まった機械を指したままにせず、準備されていない状態にする
    this.state = undefined;
    const machine = app.machine ? await this.machineFor(app, app.machine, db, hash, previous?.machine) : undefined;
    if (!app.machine) await previous?.machine?.machine.destroy();
    previous?.db.close();
    this.state = { app, db, machine, regex, options, selection: server, sessions: new Map() };
    return { refs, hash };
  }

  /** 機械を止め、DB を閉じる。使い終わった実行環境が、エミュレータのメモリを持ち続けないようにする */
  dispose(): Promise<void> {
    return this.inTurn(async () => {
      const previous = this.state;
      this.state = undefined;
      previous?.db.close();
      await previous?.machine?.machine.destroy();
    });
  }

  /** 正規表現エンジンを用意する。配布物を読むのは最初の 1 回だけ */
  private async regexFor(matchLimit: number): Promise<RegexEngine> {
    if (!this.loadAsset) throw new RuntimeError('crashed', 'この実行環境は、正規表現エンジンを動かせません');
    this.regexAsset ??= this.loadAsset(REGEX_ASSET);
    try {
      return await RegexEngine.load(await this.regexAsset, matchLimit);
    } catch (error) {
      // 読めなかった結果は覚えない（次の準備で読み直せるようにする）
      this.regexAsset = undefined;
      throw error;
    }
  }

  /**
   * 初期データを反映した機械を返す。機械の起動直後は動きが遅い（エミュレータが、よく通る処理から順に速くしていく）ので、
   * すでに動いている機械があれば使い回す。同じ初期データ（hash が同じ）なら初期状態へ戻すだけにし、
   * 違う初期データなら置き直す。応答しなくなった機械は捨てて、新しく起動する
   */
  private async machineFor(app: AppModule, spec: NonNullable<AppModule['machine']>, db: Database, hash: string, running: Running | undefined): Promise<Running> {
    if (!this.loadAsset) throw new RuntimeError('crashed', 'この実行環境は、演習用の機械を動かせません');
    const key = `${app.descriptor.id}@${app.descriptor.version}:${hash}`;
    if (running) {
      try {
        await (running.key === key ? spec.reset(running.machine) : spec.provision(running.machine, db));
        return { machine: running.machine, key };
      } catch {
        await running.machine.destroy();
      }
    }
    const machine = await Machine.boot(this.loadAsset);
    try {
      await spec.provision(machine, db);
    } catch (error) {
      // 用意に失敗した機械を、動かしたまま残さない
      await machine.destroy();
      throw error;
    }
    return { machine, key };
  }

  /** 実装の選択を保ったまま、同じ fixture と seed で初期データを作り直す。セッションは失効する。順番が来たときの準備の中身を作り直す */
  reset(): Promise<FixtureData> {
    return this.inTurn(() => {
      const s = this.require();
      return this.build(s.options, s.selection);
    });
  }

  setImplementation(hook: HookId, implementation: ImplementationId): void {
    const s = this.require();
    checkImplementation(s.app, hook, implementation, 'server');
    s.selection[hook] = implementation;
  }

  async invoke(call: Exclude<InvokeCall, { kind: 'render' }>): Promise<InvokeResult> {
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
      ...(s.machine && { machine: s.machine.machine }),
      ...(s.regex && { regex: s.regex }),
    };
    let response;
    try {
      response = await s.app.handle(ctx, call.request);
    } catch (e) {
      // 教材アプリ内の例外は基盤エラーではなく応答として返す
      const message = errorMessage(e);
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
