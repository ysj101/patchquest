// メモアプリの「スタンプを送る」画面と、そこへ iframe で埋め込む 2 つのページ（スタンプの部品・広告）。
// 埋め込むページは画面とは別の文書・別のオリジンで動き、画面とは本物の postMessage でやり取りする。
// 届いたメッセージを受け入れるかは交換点 stamp.message.accept が決め、届いたもの・送り主・結果を記録する
import type { EmbedRenderer, ViewContext } from '../../runtimes/browser/app-module';
import { el, sentenceLines } from '../shared/dom';
import type { MessageSender } from './events';
import { STAMPS, type AcceptStamp, type StampMessage } from './hooks';

/** 埋め込むページに渡すと、開いた直後にボタンを 1 回押したことにする。ボタンを押せない自動テストが、route の ?press= で使う */
const AUTO_PRESS = 'auto';
/** 広告が、押されたときに画面へ送るスタンプ */
const AD_STAMP = STAMPS[0];

/** 親のページ（「スタンプを送る」画面）へメッセージを送り、送ったものを自分のページに出す */
function sendToParent(note: HTMLElement, lead: string, message: StampMessage): void {
  // 親のページは sandbox の中にあり、オリジンを名指しできないので、宛先は '*'（どのオリジンでも）にする
  parent.postMessage(message, { targetOrigin: '*' });
  note.textContent = `${lead}${JSON.stringify(message)}`;
}

/** スタンプの部品。スタンプを押すと、親のページへ { type: 'stamp', stamp } を送る */
const pickerPage: EmbedRenderer = (root, param) => {
  const note = el('p', { className: 'muted', role: 'status' });
  const send = (stamp: string) => sendToParent(note, '親のページへ送ったメッセージ：', { type: 'stamp', stamp });
  const buttons = STAMPS.map((stamp) => {
    const button = el('button', { type: 'button' }, stamp);
    button.addEventListener('click', () => send(stamp));
    return button;
  });
  root.append(el('p', { className: 'badge' }, 'スタンプの部品（別のページ）'), el('div', { className: 'row' }, ...buttons), note);
  if (param === AUTO_PRESS) send(STAMPS[0]);
};

/** 広告。「応募する」を押すと、スタンプの部品と同じ形のメッセージを、親のページへ送る */
const adPage: EmbedRenderer = (root, param) => {
  const note = el('p', { className: 'muted', role: 'status' });
  const send = () => sendToParent(note, 'だまって親のページへ送ったメッセージ：', { type: 'stamp', stamp: AD_STAMP });
  const apply = el('button', { type: 'button' }, '応募する');
  apply.addEventListener('click', send);
  root.append(el('p', { className: 'badge' }, '広告（外部のページ）'), el('div', { className: 'row' }, el('strong', {}, 'プレゼントが当たる！'), apply), note);
  if (param === AUTO_PRESS) send();
};

export const EMBEDS: Record<string, EmbedRenderer> = { 'stamp-picker': pickerPage, ad: adPage };

/** いま開いている「スタンプを送る」画面の、メッセージの受け取りをやめる処理。開いていなければ null */
let stopListening: (() => void) | null = null;

/** 「スタンプを送る」画面から別の画面へ移るときに呼ぶ。受け取りを続けると、見えていない画面がスタンプを書き込んでしまう */
export function closeStampScreen(): void {
  stopListening?.();
  stopListening = null;
}

function embed(ctx: ViewContext, name: string, title: string, press: boolean): HTMLIFrameElement {
  const frame = el('iframe', { className: 'embed', title, src: ctx.embedSrc(name, press ? AUTO_PRESS : '') });
  // 埋め込むページにも、スクリプトだけを許す（この画面の DOM やデータには触れさせない）
  frame.setAttribute('sandbox', 'allow-scripts');
  return frame;
}

/**
 * 共有ページ id の「スタンプを送る」画面。press（picker か ad）を渡すと、その枠のボタンを開いた直後に 1 回押し、
 * 届いたメッセージの扱いが終わるまで待ってから描画を終える（自動テスト用。画面のリンクからは渡さない）
 */
export async function stampScreen(root: HTMLElement, ctx: ViewContext, id: string, press: string | null): Promise<void> {
  const res = await ctx.request({ method: 'GET', path: `/api/pages/${id}` });
  if (res.status !== 200) return void root.append(el('p', { className: 'error' }, `ページを開けませんでした（${res.status}）`));
  const { title } = (res.body as { page: { title: string } }).page;
  const picker = embed(ctx, 'stamp-picker', 'スタンプの部品', press === 'picker');
  const ad = embed(ctx, 'ad', '広告', press === 'ad');
  const written = el('ul', { className: 'stamp-written', ariaLabel: 'この画面で書き込んだスタンプ' });
  const accept = ctx.hook<AcceptStamp>('stamp.message.accept');
  let markHandled!: () => void;
  const handled = new Promise<void>((resolve) => (markHandled = resolve));

  const senderOf = (source: MessageEvent['source']): MessageSender => {
    if (source === picker.contentWindow) return 'picker';
    return source === ad.contentWindow ? 'ad' : 'other';
  };
  const receive = async (event: MessageEvent): Promise<void> => {
    const sender = senderOf(event.source);
    const stamp = accept(event, picker);
    if (stamp !== null) {
      const created = await ctx.request({ method: 'POST', path: `/api/pages/${id}/comments`, body: { body: stamp } });
      const line = created.status === 201 ? `${ctx.viewer ?? ''} さんの名前で「${stamp}」を書き込みました` : `「${stamp}」を書き込めませんでした（${created.status}）`;
      written.append(el('li', {}, line));
    }
    ctx.emit('message.received', { sender, origin: event.origin, data: JSON.stringify(event.data), accepted: stamp !== null });
    if (sender === press) markHandled();
  };
  const listener = (event: MessageEvent) => {
    // 演習の土台（学習UI。この文書と同じ配信元のページ）からの指示と応答は、教材アプリが受け取るメッセージではない
    if (event.source === parent || event.origin === location.origin) return;
    void receive(event);
  };
  window.addEventListener('message', listener);
  stopListening = () => window.removeEventListener('message', listener);

  const back = el('button', { type: 'button', className: 'link' }, '← 共有ページへ戻る');
  back.addEventListener('click', () => ctx.navigate(`/pages/${id}`));
  root.append(
    back,
    el('h2', {}, `スタンプを送る：${title}`),
    el('p', { className: 'muted' }, ...sentenceLines('スタンプを押すと、あなたの名前でコメントに書き込みます。下の 2 つの枠は、どちらもこの画面とは別のページです。')),
    picker,
    ad,
    el('h3', {}, 'この画面で書き込んだスタンプ'),
    written,
  );
  if (press !== null) await handled;
}
