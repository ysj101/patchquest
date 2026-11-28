// メモ帳が記録する観測イベントの説明（調査パネルで表示する）。計測した値だけを示し、推測で原因を断定しない
import type { ObservedEvent } from '../../platform/contract';

/** 観測ログの項目名。表示と、課題パックの文章が名指しできる名前（AppModule.eventLabels）の両方に使う */
export const EVENT_LABELS = {
  'authz.decision': '認可',
  'sql.query': 'SQL',
  'sql.error': 'SQL の失敗',
  'validation.failed': '入力検証',
  'comment.rendered': '画面に出たコメント',
  'token.checked': 'トークン',
} as const;

/** トークンの判断と、教材ロジックが測った署名の照合の結果 */
function describeToken(data: ObservedEvent['data']): string {
  const decision = data.decision === 'accept' ? '受け付けた' : '断った';
  const reason = typeof data.reason === 'string' ? data.reason : '理由の記録なし';
  const subject = typeof data.subject === 'string' ? data.subject : '読めない';
  const signature = data.signatureValid === true ? '鍵で計算した値と合う' : '鍵で計算した値と合わない';
  return `${EVENT_LABELS['token.checked']}：${decision}（${reason}）・トークンに書かれた利用者 ${subject}・署名 ${signature}`;
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
    case 'token.checked':
      return describeToken(d);
    default:
      return null;
  }
}
