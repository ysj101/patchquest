// 保存された時刻を、記録に出す日本時間の読み方にする。保存値は変えない。
const ZONE = 'Asia/Tokyo';

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string | undefined {
  return parts.find((item) => item.type === type)?.value;
}

/** 保存された時刻を日本時間の「10月21日 6:05」にする。解釈できない文字列は「日時不明」 */
export function japanDateLabel(stored: string): string {
  const date = new Date(stored);
  if (Number.isNaN(date.getTime())) return '日時不明';
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: ZONE,
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const month = part(parts, 'month');
  const day = part(parts, 'day');
  const hour = part(parts, 'hour');
  const minute = part(parts, 'minute');
  if (month === undefined || day === undefined || hour === undefined || minute === undefined) {
    throw new Error(`日本時間にできません: ${stored}`);
  }
  return `${month}月${day}日 ${hour}:${minute}`;
}
