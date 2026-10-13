// メモ帳が記録する観測イベントの説明（調査パネルで表示する）。計測した値だけを示し、推測で原因を断定しない
import type { ObservedEvent } from '../../platform/contract';

export function describeEvent(event: ObservedEvent): string | null {
  const d = event.data;
  switch (event.type) {
    case 'authz.decision':
      return `認可：${d.decision === 'allow' ? '許可' : '拒否'}（${String(d.reason)}）・主体 ${String(d.subject)}・対象 ${String(d.resource)}・所有者 ${String(d.owner)}`;
    case 'sql.query':
      return `SQL：${String(d.sql)}\nバインド値：${JSON.stringify(d.bind)}\n返却行：${String(d.rows)} 件・所有者 ${JSON.stringify(d.owners)}`;
    case 'sql.error':
      return `SQL の失敗：${String(d.message)}\n${String(d.sql)}`;
    case 'validation.failed':
      return `入力検証：${String(d.message)}`;
    case 'comment.rendered': {
      const text = d.text;
      return typeof text === 'string' ? `画面に出たコメント：${text}` : null;
    }
    default:
      return null;
  }
}
