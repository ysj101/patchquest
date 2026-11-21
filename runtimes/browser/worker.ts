// 教材ロジックと SQLite を動かす Worker。Host からの呼び出しを AppEngine へ渡す
import { RuntimeError, errorMessage } from '../../platform/contract';
import { AppEngine } from './engine';
import { lockdown } from './lockdown';
import type { AssetLoader } from './machine';
import type { WorkerEnvelope, WorkerReply, WorkerRequest, WorkerResult } from './protocol';

/** 演習用の機械の配布物は、この Worker と同じディレクトリにある。通信を塞ぐ前（最初の準備の中）で取得する */
const fetchAsset: AssetLoader = async (name) => {
  const response = await fetch(new URL(name, import.meta.url));
  if (!response.ok) throw new RuntimeError('crashed', `演習用の機械の配布物 ${name} を読めません（${response.status}）`);
  return response.arrayBuffer();
};

const engine = new AppEngine(fetchAsset);

async function handle(request: WorkerRequest): Promise<WorkerResult> {
  switch (request.op) {
    case 'prepare': {
      const fixture = await engine.prepare(request.options);
      // SQLite WASM と（使うアプリでは）演習用の機械の読み込みを終えたので、以降は通信・保存の API を使えなくする
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
    reply = { callId, attemptId, runId, ok: false, error: { code, message: errorMessage(err) } };
  }
  self.postMessage(reply);
});
