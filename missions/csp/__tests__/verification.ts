// CSP のパックの開発用の検証データ。操作で直す課題は学習画面に対策候補を持たないので、解ける値と誤った値を
// 出荷前検証の候補として確かめる。配布物には含めない
import { SETTINGS_ROUTE } from '../../../apps/board/server';
import type { ReplayEntry } from '../../../platform/contract';
import type { PackVerificationData } from '../../../tests/support/verification-data';

/** 管理者として、Content-Security-Policy の値を保存する */
const save = (value: string): ReplayEntry[] => [{ as: 'admin', request: { method: 'POST', path: SETTINGS_ROUTE, body: { value } } }];

export const cspVerification: PackVerificationData = {
  packId: 'csp',
  implementations: {},
  // 書く値。調べ方と操作のしかたには書かない
  answerTerms: ["script-src 'self'"],
  candidates: [
    // 正しい修正：スクリプトは、ページと同じ場所のファイルだけ
    { id: 'script-self', apply: [], replay: save("script-src 'self'"), expected: 'secure' },
    // 同じ修正を、すべての種類の読みこみに広げる（スクリプトの指定がなければ default-src が使われる）
    { id: 'default-self', apply: [], replay: save("default-src 'self'"), expected: 'secure' },
    // 同じ修正に、ほかの指定を足す
    { id: 'script-self-and-object', apply: [], replay: save("script-src 'self'; object-src 'none'"), expected: 'secure' },
    // 値を入れ直す：誤った値のあとで、正しい値を保存する（最後に保存した値が効く）
    { id: 'retry-then-self', apply: [], replay: [...save("script-src 'none'"), ...save("script-src 'self'")], expected: 'secure' },
    // 足りない修正：ページの中に直接書かれたスクリプトも許す
    { id: 'self-unsafe-inline', apply: [], replay: save("script-src 'self' 'unsafe-inline'"), expected: 'insufficient' },
    // 足りない修正：スクリプトと関係のない指定だけを書く
    { id: 'images-only', apply: [], replay: save("img-src 'self'"), expected: 'insufficient' },
    // 足りない修正：タグの属性に書くスクリプト（onerror など）だけを止める。script タグで書きこまれたものは動く
    { id: 'attributes-only', apply: [], replay: save("script-src-attr 'none'"), expected: 'insufficient' },
    // 足りない修正：指定の形になっていない値。ブラウザは読み飛ばす
    { id: 'not-a-policy', apply: [], replay: save('block scripts'), expected: 'insufficient' },
    // 止めすぎ：すべてのスクリプトを止める。掲示板自身のスクリプトも動かない
    { id: 'script-none', apply: [], replay: save("script-src 'none'"), expected: 'breaks-normal' },
    // 止めすぎ：すべての読みこみを止める
    { id: 'default-none', apply: [], replay: save("default-src 'none'"), expected: 'breaks-normal' },
  ],
};
