// 演習用の機械。本物の Linux を、WASM のエミュレータ（v86）の中で動かす。起動を済ませた状態から始め、
// シリアル回線で機械の中の係（apps/shell/linux/guest/agent）へ要求を 1 行送り、応答を 1 行受け取る。
// 機械にネットワークの装置は付けない。エミュレータは Worker の中で動き、通信・保存の API は塞がれている（spec §14）
import { V86 } from 'v86';

/** 機械の配布物（scripts/build-machine.mjs が作る）。Worker と同じディレクトリから読む */
export const MACHINE_ASSETS = ['v86.wasm', 'seabios.bin', 'vgabios.bin', 'linux.state.zst'] as const;
export type MachineAsset = (typeof MACHINE_ASSETS)[number];
/** 配布物を読む手段。ブラウザでは通信を塞ぐ前に取得し、Node のテストではファイルから読む */
export type AssetLoader = (name: MachineAsset) => Promise<ArrayBuffer>;

/** 機械のメモリ。状態を保存したとき（scripts/build-machine.mjs）と同じ値にする */
const MEMORY_BYTES = 96 * 1024 * 1024;
/** 応答の行の先頭。端末の出力と紛れない制御文字で始める */
const REPLY_PREFIX = '\u0002PQ ';
/** 空の本文 */
const EMPTY = '-';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 要求の本文を base64 にする */
function encode(value: string): string {
  if (value === '') return EMPTY;
  let binary = '';
  for (const byte of encoder.encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** 応答（各値のバイト数と、値をつないだものの base64）を、値の並びに戻す */
function decode(sizes: string, joined: string): string[] {
  const bytes = Uint8Array.from(atob(joined), (char) => char.charCodeAt(0));
  const values: string[] = [];
  let at = 0;
  for (const size of sizes.split(',').filter((part) => part !== '')) {
    values.push(decoder.decode(bytes.subarray(at, at + Number(size))));
    at += Number(size);
  }
  return values;
}

interface Waiting {
  id: number;
  resolve: (fields: string[]) => void;
}

/** 一度読んだ配布物は使い回す。Worker では、通信を塞いだあとの作り直し（リセット）でも読めるようにするため */
const loaded = new WeakMap<AssetLoader, Map<MachineAsset, Promise<ArrayBuffer>>>();

function asset(load: AssetLoader, name: MachineAsset): Promise<ArrayBuffer> {
  const cache = loaded.get(load) ?? new Map<MachineAsset, Promise<ArrayBuffer>>();
  loaded.set(load, cache);
  const cached = cache.get(name);
  if (cached) return cached;
  const bytes = load(name);
  cache.set(name, bytes);
  // 読めなかった結果は覚えない（一時的な失敗のあと、次の起動で読み直せるようにする）
  bytes.catch(() => cache.delete(name));
  return bytes;
}

export class Machine {
  private line = '';
  private waiting: Waiting | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private nextId = 1;

  private constructor(private readonly emulator: V86) {
    emulator.add_listener('serial0-output-byte', (byte) => this.receive(byte));
  }

  /** 起動を済ませた直後の状態から、機械を 1 台作る。機械どうしは状態を共有しない */
  static async boot(load: AssetLoader): Promise<Machine> {
    const [wasm, bios, vgaBios, initial] = await Promise.all([asset(load, 'v86.wasm'), asset(load, 'seabios.bin'), asset(load, 'vgabios.bin'), asset(load, 'linux.state.zst')]);
    const emulator = new V86({
      wasm_fn: async (imports) => (await WebAssembly.instantiate(wasm, imports)).instance.exports,
      // エミュレータが書き換えても、次に作る機械へ響かないよう写しを渡す
      bios: { buffer: bios.slice(0) },
      vga_bios: { buffer: vgaBios.slice(0) },
      initial_state: { buffer: initial.slice(0) },
      memory_size: MEMORY_BYTES,
      autostart: true,
      disable_keyboard: true,
      disable_mouse: true,
      disable_speaker: true,
    });
    await new Promise<void>((resolve) => {
      emulator.add_listener('emulator-ready', () => {
        resolve();
      });
    });
    return new Machine(emulator);
  }

  /**
   * 機械の中の係へ要求（操作と本文）を送り、応答の値を返す。本文はどんな文字列でもよい（base64 で運ぶ）。
   * 要求は 1 つずつ順に処理する。timeoutMs 以内に応答がなければ失敗にする
   */
  call(operation: string, payload: string, timeoutMs: number): Promise<string[]> {
    const result = this.queue.then(() => this.exchange(operation, payload, timeoutMs));
    this.queue = result.catch(() => undefined);
    return result;
  }

  destroy(): Promise<void> {
    return this.emulator.destroy();
  }

  private exchange(operation: string, payload: string, timeoutMs: number): Promise<string[]> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        reject(new Error(`機械が ${timeoutMs}ms 以内に応答しませんでした`));
      }, timeoutMs);
      this.waiting = {
        id,
        resolve: (fields) => {
          clearTimeout(timer);
          resolve(fields);
        },
      };
      this.emulator.serial0_send(`${operation} ${id} ${encode(payload)}\n`);
    });
  }

  private receive(byte: number): void {
    if (byte !== 0x0a) {
      this.line += String.fromCharCode(byte);
      return;
    }
    const line = this.line;
    this.line = '';
    if (!line.startsWith(REPLY_PREFIX) || !this.waiting) return;
    const [id, sizes = '', joined = ''] = line.slice(REPLY_PREFIX.length).split(' ');
    // 時間切れにした要求の応答など、待っているものと番号が合わない行は捨てる
    if (Number(id) !== this.waiting.id) return;
    const { resolve } = this.waiting;
    this.waiting = undefined;
    resolve(decode(sizes, joined));
  }
}
