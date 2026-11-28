// 正規表現エンジン PCRE2（WASM）。教材アプリが、入力チェックの正規表現を本物のエンジンで照合するのに使う。
// 照合には処理の上限（match limit）を付け、達したら PCRE2 がエラー（PCRE2_ERROR_MATCHLIMIT）で打ち切る。時間では打ち切らない。
// モジュールは scripts/build-pcre2.mjs が PCRE2 のソースから作ったもので、外の関数（import）を 1 つも使わない
import { RuntimeError } from '../../platform/contract';

/** 配布物の名前。Worker と同じディレクトリから読む */
export const REGEX_ASSET = 'pcre2.wasm';

/** pcre2_match の戻り値のうち、一致しない・処理の上限に達した、を表すもの（pcre2.h の PCRE2_ERROR_NOMATCH・PCRE2_ERROR_MATCHLIMIT） */
const NO_MATCH = -1;
const MATCH_LIMIT_REACHED = -47;
/** パターンの項目を試すたびに、数える関数（callout）を呼ばせる（pcre2.h の PCRE2_AUTO_CALLOUT） */
const AUTO_CALLOUT = 0x00000004;
const MESSAGE_BYTES = 256;

/** scripts/pcre2/wrapper.c が公開する関数 */
interface Exports {
  memory: WebAssembly.Memory;
  pq_alloc(size: number): number;
  pq_free(pointer: number): void;
  pq_compile(pattern: number, length: number, options: number): number;
  pq_release(code: number): void;
  pq_error(): number;
  pq_error_offset(): number;
  pq_match(code: number, subject: number, length: number, matchLimit: number): number;
  pq_steps(): number;
  pq_message(code: number, buffer: number, size: number): number;
  pq_version(buffer: number): number;
}

/** 1 回の照合の結果 */
export interface RegexResult {
  /** match：一致した / no-match：一致しない / limit：処理の上限に達して、結論が出ないまま打ち切った */
  outcome: 'match' | 'no-match' | 'limit';
  /** エンジンがパターンの項目を試した回数（PCRE2 の callout が呼ばれた回数）。後戻りの回数そのものではない */
  steps: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** コンパイルは 1 回にし、照合に使う実体（メモリ）は実行環境ごとに作る */
const compiled = new WeakMap<ArrayBuffer, Promise<WebAssembly.Module>>();

export class RegexEngine {
  private constructor(
    private readonly wasm: Exports,
    /** 照合 1 回あたりの処理の上限（pcre2_set_match_limit に渡す値） */
    readonly matchLimit: number,
  ) {}

  /** bytes は配布物 pcre2.wasm の中身 */
  static async load(bytes: ArrayBuffer, matchLimit: number): Promise<RegexEngine> {
    if (!Number.isInteger(matchLimit) || matchLimit < 1) throw new RuntimeError('crashed', `正規表現の処理の上限が正しくありません: ${matchLimit}`);
    let module = compiled.get(bytes);
    if (!module) {
      module = WebAssembly.compile(bytes);
      compiled.set(bytes, module);
    }
    const instance = await WebAssembly.instantiate(await module, {});
    return new RegexEngine(instance.exports as unknown as Exports, matchLimit);
  }

  /** PCRE2 の版（例：10.49 2026-09-28） */
  get version(): string {
    const buffer = this.wasm.pq_alloc(MESSAGE_BYTES);
    try {
      // 戻り値は、終端の 0 を含む長さ
      return this.read(buffer, this.wasm.pq_version(buffer) - 1);
    } finally {
      this.wasm.pq_free(buffer);
    }
  }

  /**
   * subject を pattern と照合する。pattern は PCRE2 の書き方で、区切り文字（/…/）は付けない。
   * パターンが正しくない・エンジンが別のエラーを返したときは、理由を付けて例外にする
   */
  match(pattern: string, subject: string): RegexResult {
    const code = this.withBytes(pattern, (pointer, length) => this.wasm.pq_compile(pointer, length, AUTO_CALLOUT));
    if (code === 0) throw new Error(`正規表現が正しくありません（${this.wasm.pq_error_offset()} 文字目）：${this.message(this.wasm.pq_error())}`);
    try {
      const result = this.withBytes(subject, (pointer, length) => this.wasm.pq_match(code, pointer, length, this.matchLimit));
      const steps = this.wasm.pq_steps();
      if (result === MATCH_LIMIT_REACHED) return { outcome: 'limit', steps };
      if (result === NO_MATCH) return { outcome: 'no-match', steps };
      if (result < 0) throw new Error(`正規表現の照合に失敗しました：${this.message(result)}`);
      return { outcome: 'match', steps };
    } finally {
      this.wasm.pq_release(code);
    }
  }

  /** 文字列を UTF-8 でモジュールのメモリへ置き、使い終わったら返す */
  private withBytes(text: string, use: (pointer: number, length: number) => number): number {
    const bytes = encoder.encode(text);
    const pointer = this.wasm.pq_alloc(Math.max(bytes.length, 1));
    if (pointer === 0) throw new Error('正規表現エンジンのメモリが足りません');
    try {
      new Uint8Array(this.wasm.memory.buffer, pointer, bytes.length).set(bytes);
      return use(pointer, bytes.length);
    } finally {
      this.wasm.pq_free(pointer);
    }
  }

  private read(pointer: number, length: number): string {
    return decoder.decode(new Uint8Array(this.wasm.memory.buffer, pointer, length));
  }

  /** PCRE2 のエラーコードの説明（英語） */
  private message(code: number): string {
    const buffer = this.wasm.pq_alloc(MESSAGE_BYTES);
    try {
      const length = this.wasm.pq_message(code, buffer, MESSAGE_BYTES);
      return length > 0 ? this.read(buffer, length) : `PCRE2 のエラー ${code}`;
    } finally {
      this.wasm.pq_free(buffer);
    }
  }
}
