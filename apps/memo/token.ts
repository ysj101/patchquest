// ログイントークンの発行と、トークンでメモを取り出す処理。別のアプリから使う想定なので、取り出すときはセッションを見ず、
// トークンだけで利用者を決める。トークンを受け付けてよいかは交換点（memo.token.verify）が決める
import { isObj, type AppRequest, type AppResponse } from '../../platform/contract';
import type { ServerContext } from '../../runtimes/browser/app-module';
import { json } from '../shared/http';
import { decodeToken, fromBase64Url, signToken, verifyToken, type DecodedToken } from './jwt';
import type { User } from './model';

export type TokenCheck = { ok: true; subject: string; reason: string } | { ok: false; subject: string | null; reason: string };

/**
 * 受け取ったトークンを受け付けてよいかを決め、受け付けるなら利用者（トークンの sub）を返す処理。
 * reason は観測ログに出す、判断の理由。契約 1
 */
export type CheckToken = (ctx: ServerContext, token: string) => Promise<TokenCheck>;

const TOKEN_MAX_LENGTH = 1000;
const TOKEN_REQUIRED = json(401, { error: 'トークンが必要です' });

/** 署名に使う鍵。サーバ（教材ロジック）だけが持ち、応答には出さない */
function signingSecret(ctx: ServerContext): Uint8Array<ArrayBuffer> {
  const stored = ctx.db.selectValue('SELECT secret FROM token_keys WHERE id = 1');
  const secret = typeof stored === 'string' ? fromBase64Url(stored) : null;
  if (!secret || secret.length === 0) throw new Error('署名の鍵がありません');
  return secret;
}

/** トークンの署名が、サーバの鍵で計算した値と合うか */
export const hasValidSignature = (ctx: ServerContext, token: DecodedToken): Promise<boolean> => verifyToken(token, signingSecret(ctx));

/**
 * トークンを確かめる処理を組み立てる。トークンの形でないもの・利用者（sub）が書かれていないものは断る。
 * 読めたトークンを受け付けてよいかは decide が決める。課題パックの実装もこれで作る
 */
export function checkTokenWith(decide: (ctx: ServerContext, token: DecodedToken) => Promise<{ accept: boolean; reason: string }>): CheckToken {
  return async (ctx, raw) => {
    const token = decodeToken(raw);
    if (!token) return { ok: false, subject: null, reason: 'トークンとして読めない' };
    const subject = token.payload.sub;
    if (typeof subject !== 'string' || subject === '') return { ok: false, subject: null, reason: '利用者（sub）が書かれていない' };
    const { accept, reason } = await decide(ctx, token);
    return accept ? { ok: true, subject, reason } : { ok: false, subject, reason };
  };
}

/** 基準実装：鍵で署名を計算し直し、合ったトークンだけを受け付ける */
export const checkTokenSignature: CheckToken = checkTokenWith(async (ctx, token) =>
  (await hasValidSignature(ctx, token)) ? { accept: true, reason: '署名が合った' } : { accept: false, reason: '署名が合わない' },
);

/** ログイン中の利用者のトークンを発行する。中身は利用者の名前（sub）だけ */
async function issue(ctx: ServerContext, user: User): Promise<AppResponse> {
  return json(201, { token: await signToken({ sub: user.key }, signingSecret(ctx)) });
}

/**
 * トークンに書かれた利用者のメモを返す。交換点の判断とは別に、署名が鍵で計算した値と合うかをここで測り、
 * 判断と並べて観測イベントに記録する（交換点が確かめていなくても、受け付けたトークンが本物だったかが分かる）
 */
async function memosByToken(ctx: ServerContext, req: AppRequest): Promise<AppResponse> {
  const raw = isObj(req.body) ? req.body.token : undefined;
  if (typeof raw !== 'string' || raw === '' || raw.length > TOKEN_MAX_LENGTH) return TOKEN_REQUIRED;
  const check = await ctx.hook<CheckToken>('memo.token.verify')(ctx, raw);
  const decoded = decodeToken(raw);
  const signatureValid = decoded !== null && (await hasValidSignature(ctx, decoded));
  ctx.emit('token.checked', { decision: check.ok ? 'accept' : 'reject', reason: check.reason, subject: check.subject, signatureValid });
  if (!check.ok) return json(401, { error: `トークンを受け付けられません（${check.reason}）` });
  const user = ctx.db.selectObject('SELECT id, key, name FROM users WHERE key = ?', [check.subject]) as User | undefined;
  if (!user) return json(401, { error: 'トークンの利用者が見つかりません' });
  const memos = ctx.db.selectObjects('SELECT id, owner_id AS ownerId, title, body FROM memos WHERE owner_id = ? ORDER BY id DESC', [user.id]);
  return json(200, { user: { id: user.id, key: user.key, name: user.name }, memos: memos as never });
}

/** /api/token（発行）と /api/token/memos（トークンでメモを取り出す） */
export async function handleToken(ctx: ServerContext, req: AppRequest, user: User | null, action: string | undefined): Promise<AppResponse> {
  if (req.method !== 'POST') return json(405, { error: '許可されていない操作です' });
  if (action === 'memos') return memosByToken(ctx, req);
  if (action !== undefined) return json(404, { error: '見つかりません' });
  return user ? issue(ctx, user) : json(401, { error: 'ログインが必要です' });
}
