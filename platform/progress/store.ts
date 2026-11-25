// 進捗の保存・復元・削除・JSON 入出力（spec §13）。ブラウザ内（IndexedDB）にだけ保存し、外部へは送らない。
// 保存できない環境ではメモリで続け、その理由と書き出しの必要を呼び出し側へ伝える
import { byCreatedAt, completeAttempt, canonicalJson, errorMessage, type AttemptRecord } from '../contract';
import { PROGRESS_FORMAT, PROGRESS_SCHEMA_VERSION, parseProgress, type ProgressFile, type ProgressProfile } from './schema';

import { profileFromAttempts, storedProfile, type KeptProfile, type ProfileOptions, type ProfileSummary } from './profile';
import { MAX_REVIEWS } from './review';

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

/** 取り込み時に、復習の回答は同じ回答を重ねずに合わせ、週間目標は手元の選択を優先する */
function mergeKept(local: KeptProfile, imported: KeptProfile): KeptProfile {
  const seen = new Set<string>();
  const reviews = [...(local.reviews ?? []), ...(imported.reviews ?? [])]
    .filter((review) => {
      const key = `${review.at}\u0000${review.missionId}\u0000${review.questionId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((first, second) => first.at.localeCompare(second.at))
    .slice(-MAX_REVIEWS);
  const weeklyGoal = local.weeklyGoal ?? imported.weeklyGoal;
  return { ...(reviews.length > 0 && { reviews }), ...(weeklyGoal !== undefined && { weeklyGoal }) };
}

export type ImportResult = { ok: true; imported: number; profileRecomputed: boolean } | { ok: false; error: string };

/**
 * 保存先の状態。persistent から switching を経て memory へ進むだけで、戻らない。docs/formal/Storage.tla が検査する。
 * persistent: ブラウザに保存できている / switching: 保存先が失敗し、読めた記録をメモリへ引き継いでいる途中。操作は引き継ぎの完了を待つ /
 * memory: メモリで続けている。reason は保存できない理由（メモリだけで使う検証用の保存では null）
 */
type Storage =
  | { kind: 'persistent'; backend: ProgressBackend }
  | { kind: 'switching'; memory: Promise<MemoryBackend>; reason: string }
  | { kind: 'memory'; backend: MemoryBackend; reason: string | null };

export class ProgressStore {
  private constructor(
    private storage: Storage,
    private readonly options: ProfileOptions,
  ) {}

  /** IndexedDB を開く。開けなければメモリで続ける */
  static async open(options: ProfileOptions = { missionIds: [], categories: {} }): Promise<ProgressStore> {
    try {
      return new ProgressStore({ kind: 'persistent', backend: await IndexedDbBackend.open() }, options);
    } catch (e) {
      return new ProgressStore({ kind: 'memory', backend: new MemoryBackend(), reason: `ブラウザに保存できません（${errorMessage(e)}）` }, options);
    }
  }

  static inMemory(options: ProfileOptions = { missionIds: [], categories: {} }, reason: string | null = null): ProgressStore {
    return new ProgressStore({ kind: 'memory', backend: new MemoryBackend(), reason }, options);
  }

  /** 保存できない理由。null なら保存できている */
  get unavailableReason(): string | null {
    return this.storage.kind === 'persistent' ? null : this.storage.reason;
  }

  save(attempt: AttemptRecord): Promise<void> {
    return this.withBackend((b) => b.put([attempt]));
  }

  async list(): Promise<AttemptRecord[]> {
    const records = await this.withBackend((b) => b.getAll());
    // 旧版の IndexedDB に保存された記録も、JSON 取り込みと同じ未到達の形にそろえる。
    return records.map(completeAttempt).sort(byCreatedAt);
  }

  clear(): Promise<void> {
    return this.withBackend((b) => b.clear());
  }

  /** XP と実績を記録から照合し、差分を一度の保存で黙って補正する。復習の回答と週間目標は保存値をそのまま使う。 */
  async profile(records: readonly AttemptRecord[]): Promise<ProfileSummary> {
    const saved = await this.withBackend((backend) => backend.getProfile());
    const summary = profileFromAttempts(records, this.options, saved);
    const profile = storedProfile(summary);
    if (canonicalJson(saved) !== canonicalJson(profile)) {
      await this.withBackend((backend) => backend.putProfile(profile));
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
      return { ok: false, error: errorMessage(e) };
    }
    const expected = profileFromAttempts(file.attempts, this.options, file.profile);
    const xpDiffers = file.profile.xp !== undefined && file.profile.xp.total !== expected.xp.total;
    const achievementsDiffer = file.profile.achievements !== undefined
      && JSON.stringify(Object.keys(file.profile.achievements).sort()) !== JSON.stringify(Object.keys(expected.achievements).sort());
    const profileRecomputed = xpDiffers || achievementsDiffer;
    const merged = new Map((await this.list()).map((record) => [record.attemptId, record]));
    for (const record of file.attempts) merged.set(record.attemptId, record);
    const local = await this.withBackend((backend) => backend.getProfile());
    const profile = storedProfile(profileFromAttempts([...merged.values()], this.options, mergeKept(local, file.profile)));
    await this.withBackend(async (backend) => {
      await backend.put(file.attempts);
      await backend.putProfile(profile);
    });
    return { ok: true, imported: file.attempts.length, profileRecomputed };
  }

  /** 保存先が失敗したら、読めた記録を引き継いでメモリへ切り替え、同じ操作をやり直す */
  private async withBackend<T>(operation: (backend: ProgressBackend) => Promise<T>): Promise<T> {
    const storage = this.storage;
    if (storage.kind === 'switching') return operation(await storage.memory);
    try {
      return await operation(storage.backend);
    } catch (e) {
      if (storage.kind === 'memory') throw e;
      return operation(await this.switchToMemory(storage.backend, e));
    }
  }

  /**
   * 失敗した保存先から読めた記録を引き継いで、メモリへ切り替える。切り替えは 1 回だけ行い、同時に失敗した操作は同じ切り替えを待つ
   * （操作ごとに別のメモリへ切り替えると、先にやり直した書き込みが、あとの切り替えで消える）
   */
  private switchToMemory(failed: ProgressBackend, error: unknown): Promise<MemoryBackend> {
    if (this.storage.kind === 'switching') return this.storage.memory;
    if (this.storage.kind === 'memory') return Promise.resolve(this.storage.backend);
    const reason = `ブラウザに保存できなくなりました（${errorMessage(error)}）`;
    const carryOver = async (): Promise<MemoryBackend> => {
      const backend = new MemoryBackend();
      const [attempts, profile] = await Promise.all([
        Promise.resolve().then(() => failed.getAll()).catch(() => []),
        Promise.resolve().then(() => failed.getProfile()).catch(() => ({})),
      ]);
      await Promise.all([backend.put(attempts), backend.putProfile(profile)]);
      this.storage = { kind: 'memory', backend, reason };
      return backend;
    };
    const memory = carryOver();
    this.storage = { kind: 'switching', memory, reason };
    return memory;
  }
}
