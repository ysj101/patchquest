// 定義データの検査に使う小さな検査器。課題パックの検証と進捗 JSON の検証で共有する
export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 値を検査し、違反を path 付きで集める。違反があっても既定値を返して検査を続ける */
export class Checker {
  readonly errors: string[] = [];

  fail(path: string, message: string): void {
    this.errors.push(`${path}: ${message}`);
  }

  obj(path: string, v: unknown): Obj {
    if (isObj(v)) return v;
    this.fail(path, 'オブジェクトが必要です');
    return {};
  }

  text(path: string, v: unknown): string {
    if (typeof v === 'string' && v.trim() !== '') return v;
    this.fail(path, '空でない文字列が必要です');
    return '';
  }

  /** 空でもよい文字列（長さの上限つき） */
  str(path: string, v: unknown, max: number): string {
    if (typeof v === 'string' && v.length <= max) return v;
    this.fail(path, `${max} 文字以内の文字列が必要です`);
    return '';
  }

  num(path: string, v: unknown): number {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    this.fail(path, '数値が必要です');
    return 0;
  }

  bool(path: string, v: unknown): boolean {
    if (typeof v === 'boolean') return v;
    this.fail(path, '真偽値が必要です');
    return false;
  }

  list(path: string, v: unknown, nonEmpty = false): unknown[] {
    if (!Array.isArray(v)) {
      this.fail(path, '配列が必要です');
      return [];
    }
    if (nonEmpty && v.length === 0) this.fail(path, '1件以上必要です');
    return v;
  }

  texts(path: string, v: unknown, nonEmpty = false): string[] {
    return this.list(path, v, nonEmpty).map((item, i) => this.text(`${path}[${i}]`, item));
  }

  oneOf<T>(path: string, v: unknown, options: readonly T[]): T {
    if (!options.includes(v as T)) this.fail(path, `${options.join(' / ')} のいずれかが必要です`);
    return v as T;
  }

  /** 各要素をオブジェクトとして検査し、key の値が一意かを確かめて ID の集合を返す */
  records(path: string, v: unknown, nonEmpty: boolean, each: (item: Obj, at: string) => void, key = 'id'): Set<string> {
    const ids = new Set<string>();
    this.list(path, v, nonEmpty).forEach((raw, i) => {
      const at = `${path}[${i}]`;
      const item = this.obj(at, raw);
      const id = this.text(`${at}.${key}`, item[key]);
      if (ids.has(id)) this.fail(`${at}.${key}`, `「${id}」が重複しています`);
      ids.add(id);
      each(item, at);
    });
    return ids;
  }

  ref(path: string, id: unknown, known: Set<string>, what: string): void {
    if (typeof id !== 'string' || !known.has(id)) this.fail(path, `未定義の${what}「${String(id)}」を参照しています`);
  }
}

