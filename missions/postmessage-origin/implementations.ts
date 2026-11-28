// 「送信元を確かめない postMessage」パックの実装。注入する受け取り方と、不十分な対策・正常系を壊す対策。
// 正しい対策（送り主の窓を確かめる）は教材アプリの基準実装 memo/stamp-from-picker を使う
import type { ImplementationRegistry } from '../../platform/contract';
import { readStamp, type AcceptStamp } from '../../apps/memo/hooks';

/** 注入する脆弱な実装。中身がスタンプの形なら、だれが送ったメッセージでも受け入れる */
const acceptAnySender: AcceptStamp = (event) => readStamp(event.data);

/** 対策（不十分）。オリジンが "null" かだけを確かめる。sandbox の中のページはどれも "null" なので、広告も通る */
const nullOrigin: AcceptStamp = (event) => (event.origin === 'null' ? readStamp(event.data) : null);

/** 対策（正常系が壊れる）。メッセージをすべて捨てる。スタンプの部品のスタンプも書き込めない */
const dropAll: AcceptStamp = () => null;

export const IMPLEMENTATIONS: ImplementationRegistry = {
  'postmessage-origin/accept-any-sender': { hook: 'stamp.message.accept', run: acceptAnySender },
  'postmessage-origin/null-origin': { hook: 'stamp.message.accept', run: nullOrigin },
  'postmessage-origin/drop-all': { hook: 'stamp.message.accept', run: dropAll },
};
