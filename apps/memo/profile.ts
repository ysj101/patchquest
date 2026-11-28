// 表示名の変更（PUT /api/me）と、その入力チェック。チェックの正規表現は、正規表現エンジン PCRE2 で照合する。
// エンジンには処理の上限（match limit）があり、達した照合は結論が出ないまま打ち切られる。そのときは、名前を変えずに 503 を返す
import { isObj, type AppRequest, type AppResponse } from '../../platform/contract';
import type { ServerContext } from '../../runtimes/browser/app-module';
import { json } from '../shared/http';
import { NAME_MAX_LENGTH, lengthError, type User } from './model';

/** ok：使える名前 / invalid：使えない名前（message は利用者に示す説明）/ aborted：チェックが終わらず、結論が出なかった */
export type NameCheck = { status: 'ok' } | { status: 'invalid'; message: string } | { status: 'aborted' };

/**
 * 表示名（空でなく、上限の文字数までの文字列）の入力チェック。型・未入力・文字数の検査は教材ロジックが先に行う。
 * 正規表現で確かめるときは matchName を使う（照合の記録が観測ログに残る）。契約 1
 */
export type ValidateName = (ctx: ServerContext, name: string) => NameCheck;

/**
 * 表示名の決まり：半角の英小文字と数字。記号（. _ -）は、文字と文字の間に 1 つずつ。
 * 最初のかたまりのあとは「記号 1 つ＋かたまり」のくり返しなので、同じ名前の分け方は 1 通りしかない
 */
export const NAME_PATTERN = '^[a-z0-9]+([._-][a-z0-9]+)*$';
export const NAME_RULE = '表示名に使えるのは、半角の英小文字と数字です。記号（. _ -）は、文字と文字の間に 1 つずつ入れられます';
export const NAME_ABORTED = '表示名のチェックが終わらなかったため、途中で打ち切りました';

/** 表示名を正規表現と照合し、照合の記録（パターン・入力・試した回数・結果）を観測イベントに残す */
export function matchName(ctx: ServerContext, pattern: string, name: string): 'match' | 'no-match' | 'limit' {
  if (!ctx.regex) throw new Error('正規表現エンジンが用意されていません');
  const { outcome, steps } = ctx.regex.match(pattern, name);
  // 版は「10.49 2026-09-28」の形で返るので、番号だけを出す
  const [version = ''] = ctx.regex.version.split(' ');
  ctx.emit('regex.match', { engine: `PCRE2 ${version}`, pattern, subject: name, length: Array.from(name).length, outcome, steps, matchLimit: ctx.regex.matchLimit });
  return outcome;
}

/** 正規表現 1 つで確かめる入力チェックを作る。課題パックの実装もこれで作る */
export function validateNameWith(pattern: string): ValidateName {
  return (ctx, name) => {
    const outcome = matchName(ctx, pattern, name);
    if (outcome === 'limit') return { status: 'aborted' };
    return outcome === 'match' ? { status: 'ok' } : { status: 'invalid', message: NAME_RULE };
  };
}

/** 表示名の変更。変えるのは常にセッションの利用者の名前で、リクエストの id などは使わない */
export function changeName(ctx: ServerContext, req: AppRequest, user: User): AppResponse {
  const invalid = (message: string): AppResponse => {
    ctx.emit('validation.failed', { field: 'name', message });
    return json(400, { error: message, field: 'name' });
  };
  const name = isObj(req.body) ? req.body.name : undefined;
  if (typeof name !== 'string' || name === '') return invalid('表示名を入力してください');
  const tooLong = lengthError('表示名', name, NAME_MAX_LENGTH);
  if (tooLong) return invalid(tooLong);
  const checked = ctx.hook<ValidateName>('profile.name.validate')(ctx, name);
  if (checked.status === 'aborted') return json(503, { error: NAME_ABORTED, field: 'name' });
  if (checked.status === 'invalid') return invalid(checked.message);
  ctx.db.exec({ sql: 'UPDATE users SET name = ? WHERE id = ?', bind: [name, user.id] });
  return json(200, { user: { id: user.id, key: user.key, name } });
}
