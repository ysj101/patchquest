// 案内役の短い言葉と、名前・役割を文字でも示すキャラクター表示。
import type { StoryDef } from '../contract';
import { h } from './dom';

export const GUIDE = {
  name: 'パッチ',
  role: 'セキュリティ担当の先輩',
  reactions: {
    briefing: 'まずは何が起きたか、本人の話を聞こう。',
    reproduced: '再現できたね。次は守り方を考えよう。',
    secured: '守れたね。何が効いたか振り返ろう。',
    closing: '原因と守り方を、自分の言葉で確かめよう。',
  },
};

interface Voice { name: string; role: string; text: string }

function sceneVoice<Scene extends string>(character: { name: string; role: string; reactions: Record<Scene, string> }, scene: Scene): Voice {
  return { name: character.name, role: character.role, text: character.reactions[scene] };
}

/** うまくいった場面では、案内役を「できた」顔にする。 */
const DONE_SCENES: ReadonlySet<keyof typeof GUIDE.reactions> = new Set(['reproduced', 'secured']);

/** 同梱の顔を名前入りの代替テキストで表示する。done は案内役の「できた」顔。 */
export function characterFace(name: string, guide = false, done = false): HTMLImageElement {
  let file = 'requester';
  if (guide) file = done ? 'patch-done' : 'patch';
  return h('img', {
    class: 'character-face', src: `./assets/avatars/${file}.svg`,
    alt: `${guide ? '案内役' : '依頼人'} ${name}`, width: 48, height: 48,
  });
}

/** 発言と話者を結び付ける。画像がなくても名前・役割・本文が読める。 */
export function characterVoice(voice: Voice, { guide = false, done = false, bodyClass = '', compact = false }: { guide?: boolean; done?: boolean; bodyClass?: string; compact?: boolean } = {}): HTMLElement {
  return h('figure', { class: compact ? 'character-voice character-voice-compact' : 'character-voice', 'data-character': guide ? 'guide' : 'requester' },
    characterFace(voice.name, guide, done),
    h('blockquote', {}, h('p', { class: bodyClass }, voice.text)),
    h('figcaption', {}, h('strong', {}, voice.name), ` · ${voice.role}`),
  );
}

/** 説明を増やさず、場面に合う案内役の一言を表示する。 */
export function guideVoice(scene: keyof typeof GUIDE.reactions, compact = false): HTMLElement {
  return characterVoice(sceneVoice(GUIDE, scene), { guide: true, done: DONE_SCENES.has(scene), compact });
}

/** 依頼人がいるパックでだけ、その場面の名前・役割・発言を返す。 */
export function requesterVoice(requester: StoryDef['requester'], scene: 'reproduced' | 'secured' | 'closing'): Voice | null {
  return requester ? sceneVoice(requester, scene) : null;
}
