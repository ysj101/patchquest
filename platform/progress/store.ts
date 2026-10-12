// 進捗の保存・復元・削除・JSON 入出力（spec §13）。ブラウザ内（IndexedDB）にだけ保存し、外部へは送らない。
// 保存できない環境ではメモリで続け、その理由と書き出しの必要を呼び出し側へ伝える
import type { AttemptRecord, MissionPack } from '../contract';
import { PROGRESS_FORMAT, PROGRESS_SCHEMA_VERSION, parseProgress, type ProgressFile } from './schema';

export interface ProgressBackend {
  getAll(): Promise<AttemptRecord[]>;
  put(attempts: AttemptRecord[]): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryBackend implements ProgressBackend {
  private readonly records = new Map<string, AttemptRecord>();

  async getAll(): Promise<AttemptRecord[]> {
    return [...this.records.values()].map((a) => structuredClone(a));
  }

  async put(attempts: AttemptRecord[]): Promise<void> {
    for (const a of attempts) this.records.set(a.attemptId, structuredClone(a));
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

const DB_NAME = 'patchquest';
const STORE = 'attempts';

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbBackend implements ProgressBackend {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory = indexedDB): Promise<IndexedDbBackend> {
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'attemptId' });
    return new IndexedDbBackend(await promisify(request));
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

  async clear(): Promise<void> {
    await promisify(this.db.transaction(STORE, 'readwrite').objectStore(STORE).clear());
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

  async save(attempt: AttemptRecord): Promise<void> {
    try {
      await this.backend.put([attempt]);
    } catch (e) {
      await this.degrade(e);
      await this.backend.put([attempt]);
    }
  }

  async list(): Promise<AttemptRecord[]> {
    return (await this.backend.getAll()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async clear(): Promise<void> {
    await this.backend.clear();
  }

  async exportJson(now = new Date()): Promise<string> {
    const file: ProgressFile = {
      format: PROGRESS_FORMAT,
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      attempts: await this.list(),
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
    await this.backend.put(file.attempts);
    return { ok: true, imported: file.attempts.length };
  }

  /** 保存中に失敗したら、それまでの記録を引き継いでメモリへ切り替える */
  private async degrade(e: unknown): Promise<void> {
    const memory = new MemoryBackend();
    await memory.put(await this.backend.getAll().catch(() => []));
    this.backend = memory;
    this.reason = `ブラウザに保存できなくなりました（${e instanceof Error ? e.message : String(e)}）`;
  }
}

/**
 * 記録が現在の教材の版と一致するか。一致しない記録や、復元した直後の記録の合格は、
 * 現在の状態で再検証するまで「現在の合格」として表示しない（spec §5.3, §13）
 */
export function matchesCurrentVersion(attempt: AttemptRecord, pack: MissionPack | undefined): boolean {
  if (!pack || pack.manifest.version !== attempt.missionVersion) return false;
  const recipe = pack.manifest.mutationRecipes.find((r) => r.id === attempt.recipeId);
  return recipe?.version === attempt.recipeVersion;
}
