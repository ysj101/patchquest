import { describe, expect, it } from 'vitest';
import { findExternalRefs } from '../../scripts/check-external-refs.mjs';

describe('findExternalRefs', () => {
  it('読み込み方法によらず、出荷ファイル中の外部URLを検出する', () => {
    const violations = findExternalRefs([
      { path: 'index.html', content: '<script src="https://cdn.example/x.js"></script><link href="//fonts.example/a.css">' },
      { path: 'a.css', content: '@import "//fonts.example/f.css"; .x { background: url(http://img.example/a.png) }' },
      { path: 'a.js', content: 'xhr.open("GET","https://api.example/t");img.src="https://track.example/p.gif"' },
    ]);
    expect(violations.map((v) => v.match)).toEqual([
      'https://cdn.example/x.js',
      '//fonts.example/a.css',
      'http://img.example/a.png',
      '//fonts.example/f.css',
      'https://api.example/t',
      'https://track.example/p.gif',
    ]);
  });

  it('相対参照・data URL・許可リストのURLは許可し、検査対象外の拡張子は読まない', () => {
    const violations = findExternalRefs([
      { path: 'index.html', content: '<script type="module" src="./assets/main.js"></script><img src="data:image/png;base64,AA">' },
      { path: 'a.css', content: '.x { background: url(./a.png) }' },
      { path: 'a.js', content: 'const ns = "http://www.w3.org/2000/svg"; const re = /a\\/\\/b/; fetch("./assets/sqlite3.wasm")' },
      { path: 'a.js.map', content: '"https://example.com/in-source-comment"' },
    ]);
    expect(violations).toEqual([]);
  });

  it('教材の文とテストに出てくる架空のサイト（予約済みの .example）は、決めた名前だけを許可する', () => {
    const violations = findExternalRefs([
      { path: 'main.js', content: 'const site="https://portal.example";const fake="https://evil.example/login";const like="https://portal.example.attacker.example/login";const other="https://portal.example.other.example/";fetch("https://evil.example")' },
    ]);
    expect(violations.map((violation) => violation.match)).toEqual(['https://portal.example.other.example/', 'https://evil.example']);
  });

  it('エミュレータ v86 の、通らない分岐にある URL だけを個別に許可する', () => {
    const violations = findExternalRefs([
      { path: 'runtime-worker.js', content: 'fetch(`https://${b.doh_server||"x"}/dns-query`);new URL("http://host"+p);fetch(`https://${b.other||"x"}/`);new URL("http://hostile.example/")' },
    ]);
    expect(violations.map((violation) => violation.match)).toEqual(['https://${b.other||', 'http://hostile.example/']);
  });
});
