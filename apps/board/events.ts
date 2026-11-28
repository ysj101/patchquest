// 掲示板が記録する観測イベントと、やり取りの表示（調査パネルで表示する）。計測した値だけを示し、推測で原因を断定しない
import { isObj, type AppRequest, type AppResponse, type ExchangeDescription, type JsonValue, type ObservedEvent } from '../../platform/contract';

/** 観測ログの項目名。表示と、課題パックの文章が名指しできる名前（AppModule.eventLabels）の両方に使う */
export const EVENT_LABELS = {
  'csp.violation': 'ブラウザが止めたもの',
  'board.counted': 'ページのスクリプトが数えたコメント',
  'headers.changed': '応答ヘッダの設定',
} as const;

/** 観測した値を、表示する文字にする */
const shown = (value: JsonValue | undefined): string => (typeof value === 'string' ? value : JSON.stringify(value ?? null));

export function describeEvent(event: ObservedEvent): string | null {
  const { data } = event;
  switch (event.type) {
    case 'csp.violation':
      // ブラウザが知らせた、止めたもの（blocked）と、守った指定（directive）をそのまま示す
      return `${EVENT_LABELS['csp.violation']}：${shown(data.blocked)}（守った指定：${shown(data.directive)}）`;
    case 'board.counted':
      return `${EVENT_LABELS['board.counted']}：${shown(data.count)} 件`;
    case 'headers.changed': {
      const change = data.value === null ? '外した' : `「${shown(data.value)}」にした`;
      return `${EVENT_LABELS['headers.changed']}：${shown(data.name)} を${change}`;
    }
    default:
      return null;
  }
}

/** ヘッダの値を保存する送信を、何をどう変えたかで示す（対策タブの「加えた変更」と観測ログの見出しに出る）。ほかのリクエストは、メソッドとパスのまま示す */
export function describeRequest(request: AppRequest): string | null {
  const value = request.method === 'POST' && isObj(request.body) ? request.body.value : undefined;
  if (typeof value !== 'string') return null;
  return value.trim() === '' ? 'Content-Security-Policy を外す' : `Content-Security-Policy を「${value.trim()}」にする`;
}

/** ヘッダの名前を、よく見る書き方（Content-Security-Policy）にする。応答の中では小文字で持っている */
const headerName = (name: string): string => name.replace(/(^|-)([a-z])/g, (_, dash: string, letter: string) => `${dash}${letter.toUpperCase()}`);

/** ページのやり取りを、状態コード・応答ヘッダ・本文に分けて示す（ブラウザの開発者ツールのネットワークの表示に当たる） */
export function describeExchange(request: AppRequest, response: AppResponse): ExchangeDescription {
  const headers = Object.entries(response.headers ?? {}).map(([name, value]) => `${headerName(name)}: ${value}`);
  const blocks = [{ title: '応答ヘッダ', text: headers.length > 0 ? headers.join('\n') : '（アプリが付けたヘッダはありません）' }];
  if (request.body !== undefined) blocks.unshift({ title: '送った内容', text: JSON.stringify(request.body) });
  if (typeof response.body === 'string' && response.body !== '') blocks.push({ title: '応答の本文（HTML）', text: response.body });
  return { mark: { ok: response.status < 400, text: String(response.status) }, blocks };
}
