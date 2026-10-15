// 進捗の保存・復元・削除・JSON 入出力（spec §13）。ブラウザ内（IndexedDB）にだけ保存し、外部へは送らない。
// 保存できない環境ではメモリで続け、その理由と書き出しの必要を呼び出し側へ伝える
import { initialAttemptProgress, type AttemptRecord } from '../contract';
import { PROGRESS_FORMAT, PROGRESS_SCHEMA_VERSION, parseProgress, type ProgressFile, type ProgressProfile } from './schema';

import { xpFromAttempts, type XpSummary } from './xp';

export interface ProgressBackend {
  getAll(): Promise<AttemptRecord[]>;
  getProfile(): Promise<ProgressProfile>;
  putProfile(profile: ProgressProfile): Promise<void>;
  put(attempts: AttemptRecord[]): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryBackend implements ProgressBackend {
  private profile: ProgressProfile = {};
  private readonly records = new Map<string, AttemptRecord>();

  getAll(): Promise<AttemptRecord[]> {
    return Promise.resolve([...this.records.values()].map((a) => structuredClone(a)));
  }

  put(attempts: AttemptRecord[]): Promise<void> {
    for (const a of attempts) this.records.set(a.attemptId, structuredClone(a));
    return Promise.resolve();
  }

  getProfile(): Promise<ProgressProfile> {
    return Promise.resolve(structuredClone(this.profile));
  }

  putProfile(profile: ProgressProfile): Promise<void> {
    this.profile = structuredClone(profile);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.profile = {};
    this.records.clear();
    return Promise.resolve();
  }
}

const DB_NAME = 'patchquest';
const STORE = 'attempts';
const PROFILE_STORE = 'profile';
const PROFILE_KEY = 'current';

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbBackend implements ProgressBackend {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB): Promise<IndexedDbBackend> {
    const request = factory.open(DB_NAME, 2);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (event.oldVersion < 1) {
        database.createObjectStore(STORE, { keyPath: 'attemptId' });
      }
      if (event.oldVersion < 2) {
        database.createObjectStore(PROFILE_STORE);
      }
    };
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onblocked = () => {
        // ブロック解除後に成功しても、メモリ継続に切り替えた接続は保持しない。
        request.onsuccess = () => request.result.close();
        reject(new Error('ほかのタブで PatchQuest が開いているため、保存領域を更新できません。ほかのタブを閉じてから再読み込みしてください'));
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('保存領域を開けません'));
    });
    database.onversionchange = () => database.close();
    return new IndexedDbBackend(database);
  }

  getAll(): Promise<AttemptRecord[]> {
    return promisify(this.db.transaction(STORE).objectStore(STORE).getAll());
  }

  put(attempts: AttemptRecord[]): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    for (const a of attempts) tx.objectStore(STORE).put(a);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async getProfile(): Promise<ProgressProfile> {
    const request = this.db.transaction(PROFILE_STORE).objectStore(PROFILE_STORE).get(PROFILE_KEY) as IDBRequest<ProgressProfile | undefined>;
    const profile = await promisify(request);
    return profile ?? {};
  }

  async putProfile(profile: ProgressProfile): Promise<void> {
    await promisify(this.db.transaction(PROFILE_STORE, 'readwrite').objectStore(PROFILE_STORE).put(profile, PROFILE_KEY));
  }

  async clear(): Promise<void> {
    const transaction = this.db.transaction([STORE, PROFILE_STORE], 'readwrite');
    await Promise.all([STORE, PROFILE_STORE].map((name) => promisify(transaction.objectStore(name).clear())));
  }
}

export type ImportResult = { ok: true; imported: number; xpRecomputed: boolean } | { ok: false; error: string };

export class ProgressStore {
  private constructor(
    private backend: ProgressBackend,
    /** 保存できない理由。null なら保存できている */
    private reason: string | null,
  ) {}

  /** IndexedDB を開く。開けなければメモリで続ける */
  static async open(): Promise<ProgressStore> {
    try {
      return new ProgressStore(await IndexedDbBackend.open(), null);
    } catch (e) {
      return new ProgressStore(new MemoryBackend(), `ブラウザに保存できません（${e instanceof Error ? e.message : String(e)}）`);
    }
  }

  static inMemory(reason: string | null = null): ProgressStore {
    return new ProgressStore(new MemoryBackend(), reason);
  }

  /** 保存できない理由。null なら保存できている */
  get unavailableReason(): string | null {
    return this.reason;
  }

  save(attempt: AttemptRecord): Promise<void> {
    return this.withBackend((b) => b.put([attempt]));
  }

  async list(): Promise<AttemptRecord[]> {
    const records = await this.withBackend((b) => b.getAll());
    // 旧版の IndexedDB に保存された記録も、JSON 取り込みと同じ未到達の形にそろえる。
    return records.map((record) => ({
      ...initialAttemptProgress(), ...record,
    })).sort((first, second) => first.createdAt.localeCompare(second.createdAt));
  }

  clear(): Promise<void> {
    return this.withBackend((b) => b.clear());
  }

  /** 保存済みの XP を記録から再計算し、違いがあれば黙って更新する。取得済みの一覧も利用できる。 */
  async xp(records?: AttemptRecord[]): Promise<XpSummary> {
    const summary = xpFromAttempts(records ?? await this.list());
    const profile = await this.withBackend((backend) => backend.getProfile());
    const saved = profile.xp?.total;
    if (saved !== summary.total) {
      await this.withBackend((backend) => backend.putProfile({ ...profile, xp: { total: summary.total } }));
    }
    return summary;
  }

  async exportJson(now = new Date()): Promise<string> {
    const file: ProgressFile = {
      format: PROGRESS_FORMAT,
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      attempts: await this.list(),
      profile: await this.withBackend((backend) => backend.getProfile()),
    };
    return JSON.stringify(file, null, 2);
  }

  /** 進捗 JSON を検証して取り込む（同じ attemptId は置き換える）。違反があれば何も変えずにエラーを返す */
  async importJson(text: string): Promise<ImportResult> {
    let file: ProgressFile;
    try {
      file = parseProgress(text);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const expected = xpFromAttempts(file.attempts).total;
    const xpRecomputed = file.profile.xp !== undefined && file.profile.xp.total !== expected;
    const merged = new Map((await this.list()).map((record) => [record.attemptId, record]));
    for (const record of file.attempts) merged.set(record.attemptId, record);
    const total = xpFromAttempts([...merged.values()]).total;
    await this.withBackend(async (backend) => {
      await backend.put(file.attempts);
      await backend.putProfile({ ...file.profile, xp: { total } });
    });
    return { ok: true, imported: file.attempts.length, xpRecomputed };
  }

  /** 保存先が失敗したら、読めた記録を引き継いでメモリへ切り替え、同じ操作をやり直す */
  private async withBackend<T>(operation: (backend: ProgressBackend) => Promise<T>): Promise<T> {
    try {
      return await operation(this.backend);
    } catch (e) {
      if (this.backend instanceof MemoryBackend) throw e;
      const memory = new MemoryBackend();
      const [attempts, profile] = await Promise.all([
        Promise.resolve().then(() => this.backend.getAll()).catch(() => []),
        Promise.resolve().then(() => this.backend.getProfile()).catch(() => ({})),
      ]);
      await Promise.all([memory.put(attempts), memory.putProfile(profile)]);
      this.backend = memory;
      this.reason = `ブラウザに保存できなくなりました（${e instanceof Error ? e.message : String(e)}）`;
      return operation(memory);
    }
  }
}
