// ReDoS パックの攻撃の成立条件とテスト。
// 合否は経過時間では決めない。正規表現エンジンが処理の上限（match limit）に達したかどうか（応答と照合の記録）で決め、選んだ対策の ID でも決めない
import type { ActorKey, ProbeDef, TestCase } from '../../platform/contract';
import { NAME_MAX_LENGTH } from '../../apps/memo/model';
import { NO_LIMIT_REACHED, changeName, repeatedThenInvalid } from '../../apps/memo/profile-tests';

/** 上限の文字数ちょうどで、同じ文字が続いて最後だけ使えない文字の表示名 */
export const LONGEST_ATTACK = repeatedThenInvalid(NAME_MAX_LENGTH - 1);

/** 入力チェックが最後まで終わって断り、表示名は元のままになっている */
function rejectedInFull(id: string, title: string, actor: ActorKey, name: string): TestCase {
  return {
    id,
    category: 'security',
    title,
    steps: [
      changeName(actor, name, { status: 400, body: [{ path: 'field', is: { equals: 'name' } }] }, [NO_LIMIT_REACHED]),
      { kind: 'request', as: actor, request: { method: 'GET', path: '/api/me' }, expect: { status: 200, body: [{ path: 'user.name', is: { equals: actor } }] } },
    ],
  };
}

export const PROBES: ProbeDef[] = [
  {
    id: 'check-aborted',
    title: '表示名の入力チェックが、エンジンの処理の上限に達して打ち切られる',
    steps: [changeName('alice', LONGEST_ATTACK, { status: 503 }, [{ type: 'regex.match', where: [{ path: 'outcome', is: { equals: 'limit' } }] }])],
    detect: {
      kind: 'request',
      request: { method: 'PUT', path: '/api/me' },
      response: { status: 503 },
      events: [{ type: 'regex.match', where: [{ path: 'outcome', is: { equals: 'limit' } }] }],
    },
  },
];

/** 攻撃阻止。文字や最後の 1 文字を変えても、入力チェックが最後まで終わって断る（特定の文字だけを先に断る直し方を見逃さない） */
export const CASES: TestCase[] = [
  rejectedInFull('redos.digits', '数字が続いて最後だけ使えない文字の表示名でも、入力チェックが最後まで終わって断る', 'bob', repeatedThenInvalid(NAME_MAX_LENGTH - 1, '7')),
  rejectedInFull('redos.mixed', '英字と数字が交互に続いて最後だけ使えない文字の表示名でも、入力チェックが最後まで終わって断る', 'carol', `${'x9'.repeat(9)}x!`),
  rejectedInFull('redos.space', '最後が空白の表示名でも、入力チェックが最後まで終わって断る', 'alice', `${'a'.repeat(NAME_MAX_LENGTH - 1)} `),
  rejectedInFull('redos.upper', '最後が英大文字の表示名でも、入力チェックが最後まで終わって断る', 'bob', `${'b'.repeat(NAME_MAX_LENGTH - 1)}Z`),
];
