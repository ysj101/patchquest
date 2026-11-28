// メモ帳が記録する観測イベントの説明（調査パネルで表示する）。計測した値だけを示し、推測で原因を断定しない
import type { ObservedEvent } from '../../platform/contract';

/** 観測ログの項目名。表示と、課題パックの文章が名指しできる名前（AppModule.eventLabels）の両方に使う */
export const EVENT_LABELS = {
  'authz.decision': '認可',
  'sql.query': 'SQL',
  'sql.error': 'SQL の失敗',
  'validation.failed': '入力検証',
  'comment.rendered': '画面に出たコメント',
  'message.received': '届いたメッセージ',
} as const;

/** 「スタンプを送る」画面にメッセージを送った窓（message.received の sender）の、観測ログでの呼び名 */
export const MESSAGE_SENDERS = { picker: 'スタンプの部品', ad: '広告の枠', other: 'そのほかの窓' } as const;
export type MessageSender = keyof typeof MESSAGE_SENDERS;

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
    case 'message.received':
      // 1 行目は観測ログの見出しにも出る。開かなくても、受け入れたか捨てたかが分かるようにする
      return [
        `${EVENT_LABELS['message.received']}：${typeof d.data === 'string' ? d.data : JSON.stringify(d.data)} → ${d.accepted === true ? '受け入れた' : '捨てた'}`,
        `送り主の窓（event.source）：${MESSAGE_SENDERS[d.sender as MessageSender]}`,
        `送り主のオリジン（event.origin）：${JSON.stringify(d.origin)}`,
        d.accepted === true ? '結果：受け入れた（スタンプを書き込んだ）' : '結果：捨てた（何も書き込まない）',
      ].join('\n');
    default:
      return null;
  }
}
