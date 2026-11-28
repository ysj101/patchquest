// ReDoS パックの実装。入れ子のくり返しを持つ正規表現で表示名を確かめる注入と、不十分な対策・正常系を壊す対策。
// 正しい対策（分け方が 1 通りの正規表現）は教材アプリの基準実装 memo/name-pattern を使う。照合するのは正規表現エンジン PCRE2
import type { ImplementationRegistry } from '../../platform/contract';
import { lengthError } from '../../apps/memo/model';
import { validateNameWith, type ValidateName } from '../../apps/memo/profile';

/**
 * 基準の正規表現と同じ表示名を受け入れるが、くり返しの中にくり返しがある。記号が「あってもなくてもよい」ので、
 * 英数字の並びを何通りにも分けられ、一致しない入力では、エンジンが試す回数が 1 文字ごとに 2 倍になる
 */
export const NESTED_PATTERN = '^([a-z0-9]+[._-]?)*[a-z0-9]$';
/** 「長さを縮める」対策の上限 */
export const SHORT_MAX_LENGTH = 10;

/** 注入する脆弱な実装。入れ子のくり返しを持つ正規表現で確かめる */
const nameNested = validateNameWith(NESTED_PATTERN);

/** 対策（正常系が壊れる）。正規表現はそのままで、長い表示名を先に断る。決まりに合う長い表示名まで断ってしまう */
const nameShortOnly: ValidateName = (ctx, name) => {
  const tooLong = lengthError('表示名', name, SHORT_MAX_LENGTH);
  return tooLong ? { status: 'invalid', message: tooLong } : nameNested(ctx, name);
};

/** 対策（不十分）。エンジンが照合を打ち切ったら、通ったことにする。処理量は減らず、確かめていない表示名が保存される */
const nameFailOpen: ValidateName = (ctx, name) => {
  const checked = nameNested(ctx, name);
  return checked.status === 'aborted' ? { status: 'ok' } : checked;
};

/** 対策（正常系が壊れる）。どの表示名も断る */
const nameRejectAll: ValidateName = () => ({ status: 'invalid', message: '表示名は、いまは変更できません' });

export const IMPLEMENTATIONS: ImplementationRegistry = {
  'redos/name-nested': { hook: 'profile.name.validate', run: nameNested },
  'redos/name-short-only': { hook: 'profile.name.validate', run: nameShortOnly },
  'redos/name-fail-open': { hook: 'profile.name.validate', run: nameFailOpen },
  'redos/name-reject-all': { hook: 'profile.name.validate', run: nameRejectAll },
};
