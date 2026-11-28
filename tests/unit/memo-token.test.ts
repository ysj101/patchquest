// メモアプリのログイントークン。本物の JWT（HS256）として組み立て・署名・検証できることと、発行・取り出しの応答と観測イベントを確かめる
import { describe, expect, it } from 'vitest';
import { memoApp } from '../../apps/memo';
import { describeEvent } from '../../apps/memo/events';
import { composeToken, decodeText, decodeToken, encodeText, fromBase64Url, signToken, splitToken, toBase64Url, verifyToken } from '../../apps/memo/jwt';
import type { AppRequest, ImplementationSelection, InvokeResult, JsonValue } from '../../platform/contract';
import { AppEngine } from '../../runtimes/browser/engine';

const utf8 = (text: string) => new TextEncoder().encode(text);

/** JWT の例として広く引用されているトークン。鍵は your-256-bit-secret */
const KNOWN_SECRET = utf8('your-256-bit-secret');
const KNOWN_PAYLOAD = { sub: '1234567890', name: 'John Doe', iat: 1516239022 };
const JWT_IO_EXAMPLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

function only<T>(items: T[]): T {
  const [item, ...rest] = items;
  if (item === undefined || rest.length > 0) throw new Error(`1 件ではない: ${items.length} 件`);
  return item;
}

function decoded(token: string) {
  const result = decodeToken(token);
  if (!result) throw new Error(`トークンとして読めない: ${token}`);
  return result;
}

describe('JWT（HS256）の組み立てと検証', () => {
  it('広く知られている例と同じ鍵・同じ中身から、同じトークンができる', async () => {
    expect(await signToken(KNOWN_PAYLOAD, KNOWN_SECRET)).toBe(JWT_IO_EXAMPLE);
  });

  it('発行されたままのトークンは署名が合い、中身を 1 か所変えると合わなくなる', async () => {
    const token = decoded(JWT_IO_EXAMPLE);
    expect(token.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(token.payload).toEqual(KNOWN_PAYLOAD);
    expect(await verifyToken(token, KNOWN_SECRET)).toBe(true);

    const tampered = decoded(composeToken(token.header, { ...KNOWN_PAYLOAD, name: 'Jane Doe' }, token.parts.signature));
    expect(tampered.parts.header).toBe(token.parts.header);
    expect(tampered.parts.payload).not.toBe(token.parts.payload);
    expect(await verifyToken(tampered, KNOWN_SECRET)).toBe(false);
  });

  it('別の鍵・「署名なし」（alg: none）・base64url でない署名は、合わないとする', async () => {
    const token = decoded(JWT_IO_EXAMPLE);
    expect(await verifyToken(token, utf8('another-secret'))).toBe(false);
    expect(await verifyToken(decoded(composeToken({ alg: 'none', typ: 'JWT' }, KNOWN_PAYLOAD, '')), KNOWN_SECRET)).toBe(false);
    expect(await verifyToken(decoded(composeToken({ alg: 'none', typ: 'JWT' }, KNOWN_PAYLOAD, token.parts.signature)), KNOWN_SECRET)).toBe(false);
    expect(await verifyToken({ ...token, parts: { ...token.parts, signature: '署名' } }, KNOWN_SECRET)).toBe(false);
  });

  it('base64url は、日本語を含む文字列を元に戻せる。+ / = は使わない', () => {
    const text = '{"sub":"ありす","memo":"???>>>"}';
    expect(decodeText(encodeText(text))).toBe(text);
    expect(toBase64Url(Uint8Array.from([0xfb, 0xff, 0xfe]))).toBe('-__-');
    expect(fromBase64Url('-__-')).toEqual(Uint8Array.from([0xfb, 0xff, 0xfe]));
  });

  it('トークンの形でないものは読まない', () => {
    expect(splitToken('a.b')).toBeNull();
    expect(splitToken('a.b.c.d')).toBeNull();
    expect(splitToken('a.b.')).toEqual({ header: 'a', payload: 'b', signature: '' });
    expect(fromBase64Url('a+b/')).toBeNull();
    expect(fromBase64Url('abcde')).toBeNull();
    // UTF-8 として読めないバイト列
    expect(decodeText(toBase64Url(Uint8Array.from([0xff, 0xfe])))).toBeNull();
    expect(decodeToken('トークンではない')).toBeNull();
    expect(decodeToken(`${encodeText('{"alg":"HS256"}')}.${encodeText('JSON ではない')}.x`)).toBeNull();
    expect(decodeToken(`${encodeText('{"alg":"HS256"}')}.${encodeText('["bob"]')}.x`)).toBeNull();
    expect(decodeToken(`${encodeText('"HS256"')}.${encodeText('{"sub":"bob"}')}.x`)).toBeNull();
  });
});

async function prepared(seed: number, implementations: ImplementationSelection = {}) {
  const engine = new AppEngine();
  const { refs } = await engine.prepare({ attemptId: `token-${seed}`, app: { id: 'memo', version: memoApp.descriptor.version }, fixture: { generator: 'memo.default', seed }, implementations });
  const send = async (actor: string, request: AppRequest): Promise<InvokeResult> => {
    const session = (await engine.invoke({ kind: 'session', actor })).session ?? null;
    return engine.invoke({ kind: 'request', session, request });
  };
  const issue = async (actor: string): Promise<string> => ((await send(actor, { method: 'POST', path: '/api/token' })).response?.body as { token: string }).token;
  const memos = (actor: string, token: unknown) => send(actor, { method: 'POST', path: '/api/token/memos', body: { token: token as string } });
  return { refs, send, issue, memos };
}

describe('ログイントークンの発行と取り出し', () => {
  it('同じ seed からは同じトークンが発行され、seed や利用者が違えば別のトークンになる', async () => {
    const first = await prepared(1);
    const again = await prepared(1);
    const other = await prepared(2);
    const token = await first.issue('bob');
    expect(await again.issue('bob')).toBe(token);
    expect(await other.issue('bob')).not.toBe(token);
    expect(await first.issue('alice')).not.toBe(token);
    expect(decoded(token).header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(decoded(token).payload).toEqual({ sub: 'bob' });
    // 別の seed の鍵で署名したトークンは、署名が合わない
    expect((await other.memos('bob', token)).response?.status).toBe(401);
  });

  it('発行されたトークンを送ると、ログインしていなくても、その利用者のメモが返る。判断と署名の照合の結果を記録する', async () => {
    const { refs, issue, memos } = await prepared(3);
    const { response, events } = await memos('anonymous', await issue('bob'));
    expect(response?.status).toBe(200);
    expect(response?.body).toMatchObject({ user: { id: refs['users.bob.id'], key: 'bob', name: 'bob' } });
    expect(JSON.stringify(response?.body)).toContain(refs['memos.bob.private.body']);
    expect(JSON.stringify(response?.body)).not.toContain(refs['memos.alice.private.body']);
    expect(events).toEqual([{ type: 'token.checked', data: { decision: 'accept', reason: '署名が合った', subject: 'bob', signatureValid: true } }]);
    expect(describeEvent(only(events))).toBe('トークン：受け付けた（署名が合った）・トークンに書かれた利用者 bob・署名 鍵で計算した値と合う');
  });

  it('中身を書き換えたトークンは、署名が合わないので断る', async () => {
    const { refs, issue, memos } = await prepared(3);
    const own = decoded(await issue('bob'));
    const { response, events } = await memos('bob', composeToken(own.header, { sub: 'alice' }, own.parts.signature));
    expect(response).toEqual({ status: 401, body: { error: 'トークンを受け付けられません（署名が合わない）' } });
    expect(JSON.stringify(response?.body)).not.toContain(refs['memos.alice.private.body']);
    expect(events).toEqual([{ type: 'token.checked', data: { decision: 'reject', reason: '署名が合わない', subject: 'alice', signatureValid: false } }]);
    expect(describeEvent(only(events))).toBe('トークン：断った（署名が合わない）・トークンに書かれた利用者 alice・署名 鍵で計算した値と合わない');
  });

  it('トークンがない・長すぎる・形でない・利用者が書かれていない要求は断る', async () => {
    const { memos, send } = await prepared(3);
    for (const token of [undefined, '', 42, 'x'.repeat(1001)]) {
      const { response, events } = await memos('bob', token);
      expect(response).toEqual({ status: 401, body: { error: 'トークンが必要です' } });
      expect(events).toEqual([]);
    }
    expect((await send('bob', { method: 'POST', path: '/api/token/memos' })).response?.status).toBe(401);

    const unreadable = await memos('bob', 'a.b.c');
    expect(unreadable.response?.body).toEqual({ error: 'トークンを受け付けられません（トークンとして読めない）' });
    expect(describeEvent(only(unreadable.events))).toBe('トークン：断った（トークンとして読めない）・トークンに書かれた利用者 読めない・署名 鍵で計算した値と合わない');
    for (const payload of [{}, { sub: 7 }, { sub: '' }] satisfies JsonValue[] as JsonValue[]) {
      const { response } = await memos('bob', composeToken({ alg: 'HS256', typ: 'JWT' }, payload, 'x'));
      expect(response?.body).toEqual({ error: 'トークンを受け付けられません（利用者（sub）が書かれていない）' });
    }
  });

  it('発行は POST だけで、ログインが要る。知らない経路は 404 にする', async () => {
    const { send } = await prepared(3);
    expect((await send('bob', { method: 'GET', path: '/api/token' })).response?.status).toBe(405);
    expect((await send('anonymous', { method: 'POST', path: '/api/token' })).response?.status).toBe(401);
    expect((await send('bob', { method: 'POST', path: '/api/token/unknown' })).response?.status).toBe(404);
    expect((await send('bob', { method: 'POST', path: '/api/token/memos/extra' })).response?.status).toBe(404);
  });

  it('署名を確かめない実装に替えると、実在しない利用者を名乗るトークンは、利用者が見つからないとして断る', async () => {
    const { memos } = await prepared(3, { 'memo.token.verify': 'jwt-signature/decode-only' });
    const { response, events } = await memos('bob', composeToken({ alg: 'HS256', typ: 'JWT' }, { sub: 'dave' }, 'x'));
    expect(response).toEqual({ status: 401, body: { error: 'トークンの利用者が見つかりません' } });
    expect(events[0]?.data).toMatchObject({ decision: 'accept', subject: 'dave', signatureValid: false });
  });

  it('観測イベントに理由の記録がなくても、説明を作れる', () => {
    expect(describeEvent({ type: 'token.checked', data: { decision: 'reject' } })).toBe('トークン：断った（理由の記録なし）・トークンに書かれた利用者 読めない・署名 鍵で計算した値と合わない');
  });
});
