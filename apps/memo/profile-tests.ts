// 表示名の変更（PUT /api/me）の、アプリ共通のテスト。安全な基準状態 S ではすべて通る。
// 入力チェックが「最後まで終わったか」は、経過時間ではなく、正規表現エンジンが処理の上限に達したかどうか（応答と照合の記録）で確かめる
import { ANONYMOUS, type ActorKey, type EventExpectation, type ResponseExpectation, type TestCase } from '../../platform/contract';
import { NAME_MAX_LENGTH } from './model';

/** 上限の文字数ちょうどの、決まりに合う表示名 */
export const LONGEST_NAME = 'yamada.hanako-tokyo2';

/** 照合が、エンジンの処理の上限に達していない */
export const NO_LIMIT_REACHED: EventExpectation = { type: 'regex.match', where: [{ path: 'outcome', is: { equals: 'limit' } }], presence: 'absent' };

/** 表示名を変える手順 */
export function changeName(actor: ActorKey, name: string, expect: ResponseExpectation, events?: EventExpectation[]): TestCase['steps'][number] {
  return { kind: 'request', as: actor, request: { method: 'PUT', path: '/api/me', body: { name } }, expect, ...(events && { events }) };
}

/** 同じ文字を count 個並べ、最後だけ使えない文字（!）にした表示名。入れ子のくり返しを持つ正規表現では、照合の処理量が跳ね上がる */
export const repeatedThenInvalid = (count: number, char = 'a'): string => `${char.repeat(count)}!`;

export const PROFILE_TESTS: TestCase[] = [
  {
    id: 'profile.name.change',
    category: 'normal',
    title: '表示名を、英小文字・数字と区切りの記号の名前に変えられる',
    steps: [
      changeName('alice', 'taro.yamada', { status: 200, body: [{ path: 'user.name', is: { equals: 'taro.yamada' } }] }),
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'GET', path: '/api/me' },
        expect: { status: 200, body: [{ path: 'user.name', is: { equals: 'taro.yamada' } }] },
      },
      changeName('bob', 'hanako_2', { status: 200 }),
    ],
  },
  {
    id: 'profile.name.longest',
    category: 'normal',
    title: `上限（${NAME_MAX_LENGTH} 文字）ちょうどの表示名に変えられる`,
    steps: [changeName('carol', LONGEST_NAME, { status: 200, body: [{ path: 'user.name', is: { equals: LONGEST_NAME } }] })],
  },
  {
    id: 'profile.name.rule',
    category: 'normal',
    title: '決まりに合わない表示名は、理由を示して断る',
    steps: ['taro..yamada', '.taro', 'taro-', 'Taro', '山田', `${LONGEST_NAME}0`].map((name) => changeName('bob', name, { status: 400, body: [{ path: 'field', is: { equals: 'name' } }] })),
  },
  {
    id: 'profile.name.anonymous-denied',
    category: 'security',
    title: '未ログインでは表示名を変えられない',
    steps: [changeName(ANONYMOUS, 'taro', { status: 401 })],
  },
  {
    id: 'profile.name.check-completes',
    category: 'security',
    title: '同じ文字が続いて最後だけ使えない文字の表示名でも、入力チェックが最後まで終わって断る',
    steps: [changeName('alice', repeatedThenInvalid(NAME_MAX_LENGTH - 1), { status: 400 }, [NO_LIMIT_REACHED])],
  },
];
