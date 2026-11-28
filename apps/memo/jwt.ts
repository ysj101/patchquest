// ログイントークン（JWT、RFC 7519）の組み立てと読み取り、HS256（HMAC-SHA256）の署名と検証。
// 署名と検証は WebCrypto（crypto.subtle）の本物で行う。教材ロジック（Worker）と画面（隔離 iframe）の両方から使う
import { isObj, type JsonValue } from '../../platform/contract';

/** トークンの 3 つの部分。どれも base64url で書いた文字列のまま持つ */
export interface TokenParts {
  header: string;
  payload: string;
  signature: string;
}

/** 読み取ったトークン。header と payload は JSON として読んだ中身。署名が合うかは、これだけでは分からない */
export interface DecodedToken {
  parts: TokenParts;
  header: Record<string, JsonValue>;
  payload: Record<string, JsonValue>;
}

/** この教材アプリが発行するトークンのヘッダー。署名の方式は HS256（HMAC-SHA256） */
export const TOKEN_HEADER = { alg: 'HS256', typ: 'JWT' } as const;

const HMAC = { name: 'HMAC', hash: 'SHA-256' } as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** バイト列を base64url（+ と / の代わりに - と _ を使い、末尾の = を付けない書き方）にする */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // = は末尾の詰めものにしか出てこない
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/** base64url をバイト列へ戻す。base64url として読めなければ null */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  // 4 文字ごとに 3 バイトを表すので、余りが 1 文字になる長さはない
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** 文字列を UTF-8 のバイト列にして、base64url で書く */
export const encodeText = (text: string): string => toBase64Url(encoder.encode(text));

/** base64url を文字列へ戻す。base64url でも UTF-8 でもなければ null */
export function decodeText(part: string): string | null {
  const bytes = fromBase64Url(part);
  if (!bytes) return null;
  try {
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

/** トークンを「.」で 3 つに分ける。3 つでなければ null */
export function splitToken(token: string): TokenParts | null {
  const [header, payload, signature, ...rest] = token.split('.');
  if (header === undefined || payload === undefined || signature === undefined || rest.length > 0) return null;
  return { header, payload, signature };
}

export const joinToken = (parts: TokenParts): string => `${parts.header}.${parts.payload}.${parts.signature}`;

function decodeObject(part: string): Record<string, JsonValue> | null {
  const text = decodeText(part);
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return isObj(value) ? (value as Record<string, JsonValue>) : null;
  } catch {
    return null;
  }
}

/**
 * トークンのヘッダーと中身を読む。鍵は要らないので、トークンを持っていればだれでもできる。
 * 署名は確かめない（読めたことは、中身が本物であることを意味しない）。トークンの形でなければ null
 */
export function decodeToken(token: string): DecodedToken | null {
  const parts = splitToken(token);
  if (!parts) return null;
  const header = decodeObject(parts.header);
  const payload = decodeObject(parts.payload);
  return header && payload ? { parts, header, payload } : null;
}

/** 署名を付けていないトークンを組み立てる。signature は base64url で書いた値をそのまま付ける */
export function composeToken(header: JsonValue, payload: JsonValue, signature: string): string {
  return joinToken({ header: encodeText(JSON.stringify(header)), payload: encodeText(JSON.stringify(payload)), signature });
}

const importKey = (secret: Uint8Array<ArrayBuffer>, usage: 'sign' | 'verify'): Promise<CryptoKey> => crypto.subtle.importKey('raw', secret, HMAC, false, [usage]);

/** 署名の対象は「ヘッダー.中身」の文字列（base64url のまま） */
const signingInput = (parts: TokenParts): Uint8Array<ArrayBuffer> => encoder.encode(`${parts.header}.${parts.payload}`);

/** payload を中身にして、鍵で署名した HS256 のトークンを作る。同じ鍵と中身からは、いつも同じトークンになる */
export async function signToken(payload: JsonValue, secret: Uint8Array<ArrayBuffer>): Promise<string> {
  const unsigned = splitToken(composeToken(TOKEN_HEADER, payload, ''));
  if (!unsigned) throw new Error('トークンを組み立てられません');
  const signature = await crypto.subtle.sign(HMAC, await importKey(secret, 'sign'), signingInput(unsigned));
  return joinToken({ ...unsigned, signature: toBase64Url(new Uint8Array(signature)) });
}

/**
 * トークンの署名が、鍵で「ヘッダー.中身」から計算した値と合うかを確かめる。方式は HS256 に固定し、
 * ヘッダーの alg が別の値（署名なしを表す none など）のトークンは、計算せずに合わないとする
 */
export async function verifyToken(token: DecodedToken, secret: Uint8Array<ArrayBuffer>): Promise<boolean> {
  if (token.header.alg !== TOKEN_HEADER.alg) return false;
  const signature = fromBase64Url(token.parts.signature);
  if (!signature) return false;
  return crypto.subtle.verify(HMAC, await importKey(secret, 'verify'), signature, signingInput(token.parts));
}
