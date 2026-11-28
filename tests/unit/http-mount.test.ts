// Service Worker が返す HTTP 応答と、教材アプリのやり取りのあいだの変換（runtimes/browser/http/mount.ts）
import { describe, expect, it } from 'vitest';
import { errorReply, isolate, leavesMount, mountLocation, normalizeAppPath, parseScoped, toAppRequest, toReply } from '../../runtimes/browser/http/mount';

const ORIGIN = 'http://127.0.0.1:4173';
const AT = { mount: '/assets/http/ab12cd34/', origin: ORIGIN };
const SCOPE = `${ORIGIN}/assets/http/`;
const HTML = '<!doctype html><html><head><title>t</title></head><body></body></html>';

describe('隔離のヘッダ', () => {
  it('どの応答にも、不透明なオリジンにしてスクリプトと外部の読み込みを禁じるポリシーを付ける', () => {
    expect(isolate({ 'Content-Type': 'text/html' })).toEqual({
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'content-type': 'text/html',
      'content-security-policy': "sandbox allow-forms; default-src 'none'; style-src 'unsafe-inline'",
    });
  });

  it('教材アプリが付けたポリシーは消さず、隔離のポリシーと並べる（どちらも効く）', () => {
    expect(isolate({ 'Content-Security-Policy': "script-src 'none'", 'cache-control': 'max-age=60' })).toMatchObject({
      'cache-control': 'max-age=60',
      'content-security-policy': "script-src 'none', sandbox allow-forms; default-src 'none'; style-src 'unsafe-inline'",
    });
  });
});

describe('受け持つ URL の読み方', () => {
  it('範囲の下の URL を、インスタンスと教材アプリの中のパス（クエリを含む）に分ける', () => {
    expect(parseScoped(`${SCOPE}ab12cd34/login?next=%2Fnotices%2F3#top`, SCOPE)).toEqual({ instance: 'ab12cd34', path: '/login?next=%2Fnotices%2F3' });
    expect(parseScoped(`${SCOPE}ab12cd34/`, SCOPE)).toEqual({ instance: 'ab12cd34', path: '/' });
  });

  it('範囲の外・インスタンスのない URL・形の違うインスタンスは受け付けない', () => {
    expect(parseScoped(`${ORIGIN}/assets/main.js`, SCOPE)).toBeNull();
    expect(parseScoped(`${SCOPE}ab12cd34`, SCOPE)).toBeNull();
    expect(parseScoped(`${SCOPE}/login`, SCOPE)).toBeNull();
    expect(parseScoped(`${SCOPE}AB_12/login`, SCOPE)).toBeNull();
  });
});

describe('教材アプリの中のパス', () => {
  it('/ で始まるパスを、ブラウザと同じ読み方でそろえる。.. は先頭より上へ出ない', () => {
    expect(normalizeAppPath('/login?next=https://evil.example/login', ORIGIN)).toBe('/login?next=https://evil.example/login');
    expect(normalizeAppPath('/../../index.html', ORIGIN)).toBe('/index.html');
    expect(normalizeAppPath('/notices/./3#top', ORIGIN)).toBe('/notices/3');
  });

  it('ブラウザが別のサイトとして読む値（// と /\\ で始まる）と、パスでない値は受け付けない', () => {
    expect(normalizeAppPath('//evil.example/login', ORIGIN)).toBeNull();
    expect(normalizeAppPath('/\\evil.example/login', ORIGIN)).toBeNull();
    expect(normalizeAppPath('https://evil.example/login', ORIGIN)).toBeNull();
    expect(normalizeAppPath('login', ORIGIN)).toBeNull();
    expect(normalizeAppPath('', ORIGIN)).toBeNull();
  });
});

describe('リクエストの変換', () => {
  it('GET は本文なし、POST はフォームの名前と値の組にする', () => {
    expect(toAppRequest('GET', '/login?next=%2F', null)).toEqual({ method: 'GET', path: '/login?next=%2F' });
    expect(toAppRequest('POST', '/login', 'next=%2Fnotices%2F3&memo=a+b')).toEqual({ method: 'POST', path: '/login', body: { next: '/notices/3', memo: 'a b' } });
    expect(toAppRequest('POST', '/logout', '')).toEqual({ method: 'POST', path: '/logout', body: {} });
  });

  it('GET と POST 以外は受け付けない', () => {
    expect(toAppRequest('PUT', '/login', null)).toBeNull();
    expect(toAppRequest('HEAD', '/', null)).toBeNull();
  });
});

describe('応答の変換', () => {
  it('文書には、リンクとフォームの基準になる置き場所を入れる', () => {
    expect(toReply({ status: 200, body: { headers: { 'content-type': 'text/html; charset=utf-8' }, html: HTML } }, AT)).toEqual({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<!doctype html><html><head><base href="/assets/http/ab12cd34/"><title>t</title></head><body></body></html>',
    });
  });

  it('アプリの中のパスへの Location には置き場所を前に付け、本文のない応答はそのまま返す', () => {
    expect(toReply({ status: 302, body: { headers: { location: '/notices/3?from=mail' }, html: '' } }, AT)).toEqual({ status: 302, headers: { location: '/assets/http/ab12cd34/notices/3?from=mail' }, body: '' });
    expect(mountLocation('/', AT)).toBe('/assets/http/ab12cd34/');
    expect(mountLocation('/../../index.html', AT)).toBe('/assets/http/ab12cd34/index.html');
  });

  it('外のサイトを指す Location は、書いてあるとおりに返す（ブラウザが受け取る値を変えない）', () => {
    for (const location of ['https://evil.example/login', '//evil.example/login', '/\\evil.example/login']) {
      expect(toReply({ status: 302, body: { headers: { location }, html: '' } }, AT).headers.location).toBe(location);
    }
  });

  it('ヘッダと HTML の形でない応答・<head> のない文書は、失敗させる', () => {
    expect(() => toReply({ status: 200, body: { error: 'x' } }, AT)).toThrow('ヘッダと HTML の形ではありません');
    expect(() => toReply({ status: 200, body: { headers: { location: 3 }, html: '' } }, AT)).toThrow('ヘッダと HTML の形ではありません');
    expect(() => toReply({ status: 200, body: { headers: {}, html: '<p>x</p>' } }, AT)).toThrow('<head> がありません');
  });

  it('基盤のエラーの文書は、文を文字として入れる', () => {
    expect(errorReply(503, '<b>止まっています</b> & 再開')).toMatchObject({ status: 503, body: expect.stringContaining('<p>&lt;b>止まっています&lt;/b> &amp; 再開</p>') as string });
  });
});

describe('置き場所の外への移動', () => {
  it('ブラウザが Location に従うと、置き場所の外へ出るかを見分ける', () => {
    expect(leavesMount('https://evil.example/login', '/login', AT)).toBe(true);
    expect(leavesMount('//evil.example/login', '/login', AT)).toBe(true);
    expect(leavesMount('/\\evil.example/login', '/login', AT)).toBe(true);
    expect(leavesMount('/index.html', '/login', AT)).toBe(true);
    expect(leavesMount('/assets/http/ab12cd34/notices/3', '/login', AT)).toBe(false);
    expect(leavesMount('notices/3', '/login', AT)).toBe(false);
  });

  it('アドレスとして読めない Location と、http・https 以外のアドレスは、外への移動として扱わない（ブラウザが従わない）', () => {
    expect(leavesMount('https://[', '/login', AT)).toBe(false);
    expect(leavesMount('javascript:alert(1)', '/login', AT)).toBe(false);
  });
});
