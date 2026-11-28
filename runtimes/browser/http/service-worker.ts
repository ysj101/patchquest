// 教材アプリへのリクエストに、本物の HTTP 応答（ステータス・ヘッダ・本文）を返す Service Worker（必要機能 http）。
// 受け持つのは assets/http/ の下だけで、学習UIのページは範囲の外にある。教材ロジックも状態も持たず（止まるとメモリを失うため）、
// リクエストごとに学習UI（Host）へ中身を問い合わせ、返ってきたものに隔離のヘッダを足して応答にする
import { HTTP_PROTOCOL, errorReply, isolate, parseScoped, type RelayReply, type RelayRequest } from './mount';
import { serve, type ServiceWorkerScope } from './service-worker-scope';

/** Host の答えを待つ上限。教材ロジックの呼び出しの上限（5 秒）より長くする */
const ANSWER_TIMEOUT_MS = 8000;
/** 本文を持てないステータス */
const NO_BODY = [204, 205, 304];

/**
 * 開いている学習UIのページすべてに問い合わせ、最初の答えを使う。答えるのは、そのインスタンスを持つページだけ。
 * 学習UIのページは範囲の外にあり、この Service Worker に制御されていないので、制御していないページも相手にする
 */
async function ask(sw: ServiceWorkerScope, relay: RelayRequest): Promise<RelayReply> {
  const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(errorReply(504, '演習の画面から答えがありませんでした。PatchQuest の演習の画面から開き直してください。'));
    }, ANSWER_TIMEOUT_MS);
    for (const client of windows) {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event: MessageEvent<RelayReply>) => {
        clearTimeout(timer);
        resolve(event.data);
      };
      client.postMessage({ pqHttp: relay }, [channel.port2]);
    }
  });
}

async function answer(request: Request, sw: ServiceWorkerScope): Promise<RelayReply> {
  const scoped = parseScoped(request.url, sw.registration.scope);
  if (!scoped) return errorReply(404, 'このアドレスに教材アプリはありません。');
  const form = request.method === 'POST' ? await request.text() : null;
  return ask(sw, { protocol: HTTP_PROTOCOL, ...scoped, method: request.method, form });
}

// 状態を持たないので、新しい版にすぐ切り替えても、途中のやり取りは失われない
serve(async (request, sw) => {
  const reply = await answer(request, sw).catch((error: unknown) => errorReply(500, error instanceof Error ? error.message : String(error)));
  return new Response(NO_BODY.includes(reply.status) ? null : reply.body, { status: reply.status, headers: isolate(reply.headers) });
});
