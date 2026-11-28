// メモ帳が記録する観測イベントの説明（調査パネルで表示する）。計測した値だけを示し、推測で原因を断定しない
import type { JsonValue, ObservedEvent } from '../../platform/contract';

/** 観測ログの項目名。表示と、課題パックの文章が名指しできる名前（AppModule.eventLabels）の両方に使う */
export const EVENT_LABELS = {
  'authz.decision': '認可',
  'sql.query': 'SQL',
  'sql.error': 'SQL の失敗',
  'validation.failed': '入力検証',
  'comment.rendered': '画面に出たコメント',
  'regex.match': '正規表現',
} as const;

const count = (value: JsonValue | undefined) => Number(value).toLocaleString('ja-JP');
const text = (value: JsonValue | undefined) => (typeof value === 'string' ? value : JSON.stringify(value));

const REGEX_OUTCOME: Record<string, (data: ObservedEvent['data']) => string> = {
  match: () => '一致した',
  'no-match': () => '一致しない',
  // 上限（match limit）はエンジンの中の処理の数え方で、「試した回数」とは別のもの
  limit: (data) => `結論が出ないまま打ち切り（エンジンの処理の上限 match limit ${count(data.matchLimit)} に達した）`,
};

/** 照合の記録。回数は、エンジンがパターンの項目を試した回数（callout の回数）で、後戻りの回数そのものではない */
function describeRegexMatch(data: ObservedEvent['data']): string | null {
  const outcome = typeof data.outcome === 'string' ? REGEX_OUTCOME[data.outcome] : undefined;
  if (!outcome) return null;
  return [
    `${EVENT_LABELS['regex.match']}：${text(data.pattern)}（${text(data.engine)}）`,
    `入力：${text(data.subject)}（${count(data.length)} 文字）`,
    `結果：${outcome(data)}`,
    `パターンの項目を試した回数：${count(data.steps)} 回`,
  ].join('\n');
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
    case 'regex.match':
      return describeRegexMatch(d);
    default:
      return null;
  }
}
