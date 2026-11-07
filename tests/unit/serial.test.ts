// serialLatest：描画要求の直列化・追い越し・同じ鍵の合流
import { describe, expect, it } from 'vitest';
import { serialLatest } from '../../platform/ui/serial';

/** 待機中の要求が始まるまで（マイクロタスクが流れるまで）待つ */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

type Gate = { promise: Promise<void>; open: () => void };
function gate(): Gate {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** 呼ばれた引数を記録し、対応する門が開くまで終わらない task */
function recordingTask() {
  const started: string[] = [];
  const gates = new Map<string, Gate>();
  const task = async (arg: string): Promise<string> => {
    started.push(arg);
    const opened = gate();
    gates.set(arg, opened);
    await opened.promise;
    return `done:${arg}`;
  };
  return { started, finish: (arg: string) => gates.get(arg)?.open(), task };
}

describe('serialLatest', () => {
  it('前の実行が終わるまで次を始めず、順番どおりに実行する', async () => {
    const { started, finish, task } = recordingTask();
    const run = serialLatest(task);
    const first = run('a');
    await tick();
    const second = run('b');
    await tick();
    expect(started).toEqual(['a']);
    finish('a');
    expect(await first).toBe('done:a');
    await tick();
    expect(started).toEqual(['a', 'b']);
    finish('b');
    expect(await second).toBe('done:b');
  });

  it('待機中に後から要求が来たら、古い待機は実行せず undefined で終わる', async () => {
    const { started, finish, task } = recordingTask();
    const run = serialLatest(task);
    const first = run('a');
    await tick();
    const skipped = run('b');
    const last = run('c');
    finish('a');
    await first;
    expect(await skipped).toBeUndefined();
    await tick();
    finish('c');
    expect(await last).toBe('done:c');
    expect(started).toEqual(['a', 'c']);
  });

  it('鍵を渡すと、同じ鍵の要求が実行中なら新たに実行せず、実行中の結果に合流する', async () => {
    const { started, finish, task } = recordingTask();
    const run = serialLatest(task, (arg) => arg);
    const first = run('alice');
    await tick();
    const joined = run('alice');
    finish('alice');
    expect(await first).toBe('done:alice');
    expect(await joined).toBe('done:alice');
    expect(started).toEqual(['alice']);
  });

  it('鍵が違う要求は合流せず、実行中のものが終わってから実行する', async () => {
    const { started, finish, task } = recordingTask();
    const run = serialLatest(task, (arg) => arg);
    const first = run('alice');
    await tick();
    const second = run('bob');
    finish('alice');
    await first;
    await tick();
    expect(started).toEqual(['alice', 'bob']);
    finish('bob');
    expect(await second).toBe('done:bob');
  });

  it('鍵が null の要求は、同じ内容が実行中でも合流せずに実行する', async () => {
    const { started, finish, task } = recordingTask();
    const run = serialLatest(task, () => null);
    const first = run('alice');
    await tick();
    const second = run('alice');
    finish('alice');
    await first;
    await tick();
    expect(started).toEqual(['alice', 'alice']);
    finish('alice');
    expect(await second).toBe('done:alice');
  });

  it('別の鍵の要求が待機中なら、実行中と同じ鍵でも合流せず、待機中の要求を追い越して実行する', async () => {
    const { started, finish, task } = recordingTask();
    const run = serialLatest(task, (arg) => arg);
    const first = run('alice');
    await tick();
    const waiting = run('bob');
    const latest = run('alice');
    finish('alice');
    expect(await first).toBe('done:alice');
    expect(await waiting).toBeUndefined();
    await tick();
    expect(started).toEqual(['alice', 'alice']);
    finish('alice');
    expect(await latest).toBe('done:alice');
  });

  it('実行中の task が失敗しても、次の要求は実行される', async () => {
    const run = serialLatest((arg: string) => (arg === 'bad' ? Promise.reject(new Error('失敗')) : Promise.resolve(arg)));
    await expect(run('bad')).rejects.toThrow('失敗');
    expect(await run('ok')).toBe('ok');
  });
});
