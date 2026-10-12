// 教材ロジックと SQLite を動かす Worker。Host からの呼び出しを AppEngine へ渡す
import { RuntimeError } from '../../platform/contract';
import { AppEngine } from './engine';
import { lockdown } from './lockdown';
import type { WorkerEnvelope, WorkerReply, WorkerRequest, WorkerResult } from './protocol';

const engine = new AppEngine();

async function handle(request: WorkerRequest): Promise<WorkerResult> {
  switch (request.op) {
    case 'prepare': {
      const fixture = await engine.prepare(request.options);
      // SQLite WASM の読み込みを終えたので、以降は通信・保存の API を使えなくする
      lockdown();
      return fixture;
    }
    case 'invoke':
      return engine.invoke(request.call);
    case 'setImplementation':
      engine.setImplementation(request.hook, request.implementation);
      return null;
    case 'reset':
      return engine.reset();
  }
}

self.addEventListener('message', async (e: MessageEvent<WorkerEnvelope>) => {
  const { callId, attemptId, runId, request } = e.data;
  let reply: WorkerReply;
  try {
    reply = { callId, attemptId, runId, ok: true, result: await handle(request) };
  } catch (err) {
    const code = err instanceof RuntimeError ? err.code : 'crashed';
    reply = { callId, attemptId, runId, ok: false, error: { code, message: err instanceof Error ? err.message : String(err) } };
  }
  self.postMessage(reply);
});
