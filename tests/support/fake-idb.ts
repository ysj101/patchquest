// IndexedDbBackend の単体テスト用。open・版の更新・get/put/clear だけを再現する
import type { AttemptRecord } from '../../platform/contract';

interface FakeStore {
  keyPath: string | null;
  rows: Map<IDBValidKey, unknown>;
}

interface FakeDatabase {
  version: number;
  stores: Map<string, FakeStore>;
}

interface OpenRequest {
  result: IDBDatabase;
  error: DOMException | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onupgradeneeded: ((event: Event) => void) | null;
}

function later(run: () => void): void {
  queueMicrotask(run);
}

function storeNames(stores: Map<string, FakeStore>): DOMStringList {
  const names = [...stores.keys()];
  return {
    length: names.length,
    contains: (name: string) => stores.has(name),
    item: (index: number) => names[index] ?? null,
    *[Symbol.iterator]() {
      yield* names;
    },
  } as DOMStringList;
}

class FakeObjectStore {
  constructor(private readonly store: FakeStore) {}

  get(key: IDBValidKey): IDBRequest {
    return this.request(this.store.rows.has(key) ? structuredClone(this.store.rows.get(key)) : undefined);
  }

  getAll(): IDBRequest {
    return this.request([...this.store.rows.values()].map((row) => structuredClone(row)));
  }

  put(value: unknown, key?: IDBValidKey): IDBRequest<IDBValidKey> {
    const record = structuredClone(value);
    const resolved = key ?? this.keyOf(record);
    this.store.rows.set(resolved, record);
    return this.request(resolved);
  }

  clear(): IDBRequest {
    this.store.rows.clear();
    return this.request(undefined);
  }

  private keyOf(record: unknown): IDBValidKey {
    if (this.store.keyPath === null || typeof record !== 'object' || record === null) throw new Error('キーがありません');
    const value = (record as Record<string, unknown>)[this.store.keyPath];
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error('キーがありません');
    return value;
  }

  private request<Result>(result: Result): IDBRequest<Result> {
    const request = { result, error: null, onsuccess: null, onerror: null } as IDBRequest<Result>;
    later(() => {
      request.onsuccess?.(new Event('success'));
    });
    return request;
  }
}

class FakeDatabaseHandle {
  closed = false;

  constructor(private readonly database: FakeDatabase) {}

  get objectStoreNames(): DOMStringList {
    return storeNames(this.database.stores);
  }

  close(): void {
    this.closed = true;
  }

  createObjectStore(name: string, options?: IDBObjectStoreParameters): IDBObjectStore {
    const keyPath = typeof options?.keyPath === 'string' ? options.keyPath : null;
    const store = { keyPath, rows: new Map<IDBValidKey, unknown>() };
    this.database.stores.set(name, store);
    return new FakeObjectStore(store) as unknown as IDBObjectStore;
  }

  transaction(storeNames: string | string[]): IDBTransaction {
    if (this.closed) throw new Error('データベースは閉じています');
    const requested = Array.isArray(storeNames) ? storeNames : [storeNames];
    for (const name of requested) {
      if (!this.database.stores.has(name)) throw new Error(`オブジェクトストア「${name}」がありません`);
    }
    const transaction = {
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
      objectStore: (name: string) => {
        const store = this.database.stores.get(name);
        if (!store) throw new Error(`オブジェクトストア「${name}」がありません`);
        return new FakeObjectStore(store) as unknown as IDBObjectStore;
      },
    } as IDBTransaction;
    later(() => {
      transaction.oncomplete?.(new Event('complete'));
    });
    return transaction;
  }
}

function openRequest(databases: Map<string, FakeDatabase>, name: string, version: number): IDBOpenDBRequest {
  const request = { error: null, onsuccess: null, onerror: null, onupgradeneeded: null } as OpenRequest;
  later(() => {
    const database = databases.get(name) ?? { version: 0, stores: new Map<string, FakeStore>() };
    databases.set(name, database);
    const handle = new FakeDatabaseHandle(database);
    request.result = handle as unknown as IDBDatabase;
    if (database.version < version) {
      request.onupgradeneeded?.(new Event('upgradeneeded'));
      database.version = version;
    }
    request.onsuccess?.(new Event('success'));
  });
  return request as unknown as IDBOpenDBRequest;
}

export interface FakeIndexedDb {
  factory: IDBFactory;
  /** version 1 で attempts だけがある状態にする */
  seedLegacy(records: AttemptRecord[]): void;
}

/** IndexedDbBackend.open に渡す、メモリ上の IDBFactory */
export function createFakeIndexedDb(): FakeIndexedDb {
  const databases = new Map<string, FakeDatabase>();
  return {
    factory: { open: (name: string, version = 1) => openRequest(databases, name, version) } as unknown as IDBFactory,
    seedLegacy(records: AttemptRecord[]): void {
      const rows = new Map<IDBValidKey, unknown>();
      for (const record of records) rows.set(record.attemptId, structuredClone(record));
      databases.set('patchquest', { version: 1, stores: new Map([['attempts', { keyPath: 'attemptId', rows }]]) });
    },
  };
}
