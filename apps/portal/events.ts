// 社内ポータルの、観測ログでの表示。HTTP の応答（ステータス・ヘッダ・本文）を、ブラウザの開発者ツールと同じ並びで示す。計測した値だけを示す
import { isObj, type AppRequest, type AppResponse, type ExchangeDescription, type ObservedEvent } from '../../platform/contract';
import { isHttpBody } from '../../runtimes/browser/http/mount';

/** 観測ログの項目名。表示と、課題パックの文章が名指しできる名前（AppModule.eventLabels）の両方に使う */
export const EVENT_LABELS = { 'portal.redirect': 'リダイレクト' } as const;

export function describeEvent(event: ObservedEvent): string | null {
  const { location, external } = event.data;
  if (event.type !== 'portal.redirect' || typeof location !== 'string') return null;
  return `${EVENT_LABELS['portal.redirect']}：行き先 ${location}（このサイトの${external === true ? '外' : '中'}）`;
}

/** ヘッダの名前を、開発者ツールでよく見る書き方（Location・Content-Type）にする */
const headerName = (name: string): string => name.split('-').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join('-');

/** フォームで送った本文を、名前=値 の行にする */
function formLines(body: AppRequest['body']): string {
  return isObj(body) ? Object.entries(body).map(([name, value]) => `${name}=${typeof value === 'string' ? value : JSON.stringify(value)}`).join('\n') : '';
}

/** やり取りを、リクエスト・応答のステータスとヘッダ・本文（HTML）に分けて示す。HTTP 応答の形でないものは説明しない */
export function describeExchange(request: AppRequest, response: AppResponse): ExchangeDescription | null {
  const body = response.body;
  if (!isHttpBody(body)) return null;
  const form = formLines(request.body);
  const headers = Object.entries(body.headers).map(([name, value]) => `${headerName(name)}: ${value}`).join('\n');
  return {
    mark: { ok: response.status < 400, text: String(response.status) },
    blocks: [
      { title: 'リクエスト', text: form === '' ? `${request.method} ${request.path}` : `${request.method} ${request.path}\n\n${form}` },
      { title: `応答（ステータス ${response.status}）のヘッダ`, text: headers },
      ...(body.html === '' ? [] : [{ title: '応答の本文（HTML）', text: body.html }]),
    ],
  };
}
