// 進捗の保存・復元・削除・JSON 入出力（spec §13）。ブラウザ内（IndexedDB）にだけ保存し、外部へは送らない。
// 保存できない環境ではメモリで続け、その理由と書き出しの必要を呼び出し側へ伝える
import type { AttemptRecord } from '../contract';
import {
  emptyProfile,
  parseProgress,
  PROGRESS_FORMAT,
  PROGRESS_SCHEMA_VERSION,
  type CrossAttemptProfile,
  type ParsedProgress,
  type ProgressFile,
} from './schema';

export interface ProgressBackend {
  getAll(): Promise<AttemptRecord[]>;
  put(attempts: AttemptRecord[]): Promise<void>;
  getProfile(): Promise<CrossAttemptProfile>;
  putProfile(profile: CrossAttemptProfile): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryBackend implements ProgressBackend {
  private readonly records = new Map<string, AttemptRecord>();
  private profile = emptyProfile();

  async getAll(): Promise<AttemptRecord[]> {
    return [...this.records.values()].map((a) => structuredClone(a));
  }

  async put(attempts: AttemptRecord[]): Promise<void> {
    for (const a of attempts) this.records.set(a.attemptId, structuredClone(a));
  }

  getProfile(): Promise<CrossAttemptProfile> {
    return Promise.resolve(structuredClone(this.profile));
  }

  putProfile(profile: CrossAttemptProfile): Promise<void> {
    this.profile = structuredClone(profile);
    return Promise.resolve();
  }

  async clear(): Promise<void> {
    this.records.clear();
    this.profile = emptyProfile();
  }
}

const DB_NAME = 'patchquest';
const ATTEMPTS = 'attempts';
const PROFILE = 'profile';
const PROFILE_KEY = 'profile';
/** 1 は attempts だけ。2 で演習をまたぐ記録（profile）を足す */
const DB_VERSION = 2;

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function upgrade(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(ATTEMPTS)) database.createObjectStore(ATTEMPTS, { keyPath: 'attemptId' });
  if (!database.objectStoreNames.contains(PROFILE)) database.createObjectStore(PROFILE);
}

export class IndexedDbBackend implements ProgressBackend {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB): Promise<IndexedDbBackend> {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => upgrade(request.result);
    return new IndexedDbBackend(await promisify(request));
  }

  getAll(): Promise<AttemptRecord[]> {
    return promisify(this.db.transaction(ATTEMPTS).objectStore(ATTEMPTS).getAll());
  }

  put(attempts: AttemptRecord[]): Promise<void> {
    const transaction = this.db.transaction(ATTEMPTS, 'readwrite');
    for (const a of attempts) transaction.objectStore(ATTEMPTS).put(a);
    return transactionDone(transaction);
  }

  async getProfile(): Promise<CrossAttemptProfile> {
    const stored = (await promisify(this.db.transaction(PROFILE).objectStore(PROFILE).get(PROFILE_KEY))) as unknown;
    if (stored === undefined) return emptyProfile();
    // 保存した値も取り込みと同じ検証に通す。欠けるのは旧 DB（profile ストアが空）だけ
    return parseProgress(
      JSON.stringify({ format: PROGRESS_FORMAT, schemaVersion: PROGRESS_SCHEMA_VERSION, exportedAt: '', attempts: [], profile: stored }),
    ).file.profile;
  }

  putProfile(profile: CrossAttemptProfile): Promise<void> {
    const transaction = this.db.transaction(PROFILE, 'readwrite');
    transaction.objectStore(PROFILE).put(profile, PROFILE_KEY);
    return transactionDone(transaction);
  }

  clear(): Promise<void> {
    const transaction = this.db.transaction([ATTEMPTS, PROFILE], 'readwrite');
    transaction.objectStore(ATTEMPTS).clear();
    transaction.objectStore(PROFILE).clear();
    return transactionDone(transaction);
  }
}

export type ImportResult = { ok: true; imported: number } | { ok: false; error: string };

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
    return (await this.withBackend((b) => b.getAll())).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  clear(): Promise<void> {
    return this.withBackend((b) => b.clear());
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

  /**
   * 進捗 JSON を検証して取り込む（同じ attemptId は置き換える）。
   * schemaVersion 1 は 2 へ変換し、profile は無かったものとして保存済みの値を残す。
   * 違反があれば何も変えずにエラーを返す。
   */
  async importJson(text: string): Promise<ImportResult> {
    let parsed: ParsedProgress;
    try {
      parsed = parseProgress(text);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    await this.withBackend(async (backend) => {
      await backend.put(parsed.file.attempts);
      if (parsed.replaceProfile) await backend.putProfile(parsed.file.profile);
    });
    return { ok: true, imported: parsed.file.attempts.length };
  }

  /** 保存先が失敗したら、読めた attempts と profile を引き継いでメモリへ切り替え、同じ操作をやり直す */
  private async withBackend<T>(operation: (backend: ProgressBackend) => Promise<T>): Promise<T> {
    try {
      return await operation(this.backend);
    } catch (e) {
      if (this.backend instanceof MemoryBackend) throw e;
      const memory = new MemoryBackend();
      await memory.put(await this.backend.getAll().catch(() => []));
      await memory.putProfile(await this.backend.getProfile().catch(() => emptyProfile()));
      this.backend = memory;
      this.reason = `ブラウザに保存できなくなりました（${e instanceof Error ? e.message : String(e)}）`;
      return operation(memory);
    }
  }
}
