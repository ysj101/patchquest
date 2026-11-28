// ReDoS パックの開発用の検証データ。問い合わせに出てきた文字（!）だけを先に断る誤った修正を、
// 共通の出荷前検証で insufficient（攻撃阻止のテストだけが失敗）と判定できることを確かめる。配布物には含めない
import { validateNameWith, type ValidateName } from '../../../apps/memo/profile';
import type { PackVerificationData } from '../../../tests/support/verification-data';
import { NESTED_PATTERN } from '../implementations';

const nameNested = validateNameWith(NESTED_PATTERN);

/** ! を含む表示名だけを、照合の前に断る。最後の 1 文字をほかの使えない文字にすれば、照合は同じように打ち切られる */
const nameBlockBang: ValidateName = (ctx, name) => (name.includes('!') ? { status: 'invalid', message: '表示名に ! は使えません' } : nameNested(ctx, name));

export const redosVerification: PackVerificationData = {
  packId: 'redos',
  implementations: {
    'redos/wrong-fix-block-bang': { hook: 'profile.name.validate', run: nameBlockBang },
  },
  candidates: [{ id: 'wrong-fix-block-bang', apply: [{ hook: 'profile.name.validate', implementation: 'redos/wrong-fix-block-bang' }], expected: 'insufficient' }],
  answerTerms: ['入れ子', '書き直', '1 通り', '必ず 1 つ'],
};
