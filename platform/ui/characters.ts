// 案内役の名前と顔、依頼人の発言を名前・役割つきで示すキャラクター表示。
import { h } from './dom';

export const GUIDE = { name: 'パッチ' };

interface Voice { name: string; role: string; text: string }

function stillFace(file: string, label: string): HTMLImageElement {
  return h('img', { class: 'character-face', src: `./assets/avatars/${file}.svg`, alt: label, width: 48, height: 48 });
}

/** 案内役パッチの顔。口は画像の外に置き、data-motion と prefers-reduced-motion が点滅を止められるようにする */
export function guideFace(): HTMLElement {
  return h('span', { class: 'character-live' },
    stillFace('patch', `案内役 ${GUIDE.name}`),
    h('span', { class: 'character-cursor', 'aria-hidden': true }),
  );
}

/** 依頼人の発言と話者を結び付ける。画像がなくても名前・役割・本文が読める。 */
export function requesterVoice(voice: Voice, bodyClass: string): HTMLElement {
  return h('figure', { class: 'character-voice', 'data-character': 'requester' },
    stillFace('requester', `依頼人 ${voice.name}`),
    h('blockquote', {}, h('p', { class: bodyClass }, voice.text)),
    h('figcaption', {}, h('strong', {}, voice.name), ` · ${voice.role}`),
  );
}
