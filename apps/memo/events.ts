// メモ帳が記録する観測イベントの説明（調査パネルで表示する）。計測した値だけを示し、推測で原因を断定しない
import { isObj, type AppRequest, type AppResponse, type ExchangeDescription, type JsonValue, type ObservedEvent } from '../../platform/contract';

/** 観測ログの項目名。表示と、課題パックの文章が名指しできる名前（AppModule.eventLabels）の両方に使う */
export const EVENT_LABELS = {
  'authz.decision': '認可',
  'sql.query': 'SQL',
  'sql.error': 'SQL の失敗',
  'validation.failed': '入力検証',
  'comment.rendered': '画面に出たコメント',
  'xml.parse': 'XML の解析',
} as const;

/** 記録した値を、そのまま文字にする。文字列でなければ JSON にする */
const shown = (value: JsonValue | undefined): string => (typeof value === 'string' ? value : JSON.stringify(value ?? null));

/** パーサーが読もうとした資源 1 件。渡したバイト数は実測 */
function describeResource(resource: JsonValue): string {
  if (!isObj(resource)) return shown(resource);
  const outcome = resource.opened === true ? `渡した ${shown(resource.bytes)} バイト` : '開けなかった';
  return `${shown(resource.uri)}（${outcome}）`;
}

/** 値が空でない配列なら、各要素を describe して sep でつなぐ。そうでなければ「なし」 */
const listed = (value: JsonValue | undefined, describe: (item: JsonValue) => string, sep: string): string =>
  Array.isArray(value) && value.length > 0 ? value.map(describe).join(sep) : 'なし';

/** XML の解析。渡したオプション、求められた資源と渡したバイト数、失敗したときはその理由 */
function describeXmlParse(data: ObservedEvent['data']): string {
  const failure = typeof data.error === 'string' ? `\n解析の失敗：${data.error}` : '';
  return `${EVENT_LABELS['xml.parse']}：オプション ${listed(data.options, shown, ' | ')}\n求められた資源：${listed(data.resources, describeResource, '、')}${failure}`;
}

/**
 * 取り込みのやり取りは、取り込んだ XML を書いたとおりに示す（JSON の文字列のままでは、改行が \\n になって読めない）。
 * ほかのやり取りは説明しない（リクエストと応答をそのまま示す）
 */
export function describeExchange(request: AppRequest, response: AppResponse): ExchangeDescription | null {
  if (request.method !== 'POST' || request.path !== '/api/import' || !isObj(request.body) || typeof request.body.xml !== 'string') return null;
  return {
    mark: { ok: response.status < 400, text: String(response.status) },
    blocks: [
      { title: '取り込んだ XML', text: request.body.xml },
      { title: `応答（status ${response.status}）`, text: JSON.stringify(response.body, null, 2) },
    ],
  };
}

export function describeEvent(event: ObservedEvent): string | null {
  const d = event.data;
  switch (event.type) {
    case 'authz.decision':
      return `${EVENT_LABELS['authz.decision']}：${d.decision === 'allow' ? '許可' : '拒否'}（${String(d.reason)}）・主体 ${String(d.subject)}・対象 ${String(d.resource)}・所有者 ${String(d.owner)}`;
    case 'sql.query':
      return `${EVENT_LABELS['sql.query']}：${String(d.sql)}\nバインド値：${JSON.stringify(d.bind)}\n返却行：${String(d.rows)} 件・所有者 ${JSON.stringify(d.owners)}`;
    case 'sql.error':
      return `${EVENT_LABELS['sql.error']}：${String(d.message)}\n${String(d.sql)}`;
    case 'validation.failed':
      return `${EVENT_LABELS['validation.failed']}：${String(d.message)}`;
    case 'comment.rendered': {
      const text = d.text;
      return typeof text === 'string' ? `${EVENT_LABELS['comment.rendered']}：${text}` : null;
    }
    case 'xml.parse':
      return describeXmlParse(d);
    default:
      return null;
  }
}
