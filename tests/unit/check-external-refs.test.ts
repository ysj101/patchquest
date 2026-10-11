import { describe, expect, it } from 'vitest';
import { findExternalRefs } from '../../scripts/check-external-refs.mjs';

describe('findExternalRefs', () => {
  it('HTML・CSS・JSの外部読み込みを検出する', () => {
    const violations = findExternalRefs([
      { path: 'index.html', content: '<script src="https://cdn.example/x.js"></script><link href="//fonts.example/a.css">' },
      { path: 'a.css', content: '@import url("https://fonts.example/f.css"); .x { background: url(http://img.example/a.png) }' },
      { path: 'a.js', content: 'fetch("https://api.example/t");import("//cdn.example/m.js");new Worker(`https://w.example/w.js`)' },
    ]);
    expect(violations.map((v) => v.path)).toEqual(['index.html', 'index.html', 'a.css', 'a.css', 'a.js', 'a.js', 'a.js']);
  });

  it('同梱ファイルの相対参照や読み込みを伴わない文字列は許可する', () => {
    const violations = findExternalRefs([
      { path: 'index.html', content: '<script type="module" src="./assets/main.js"></script><img src="data:image/png;base64,AA">' },
      { path: 'a.css', content: '.x { background: url(./a.png) }' },
      { path: 'a.js', content: 'const ns = "http://www.w3.org/2000/svg"; fetch("./assets/sqlite3.wasm")' },
    ]);
    expect(violations).toEqual([]);
  });
});
