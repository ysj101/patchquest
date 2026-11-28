// 架空の初期データ。seed から、コメントの ID・並び・内容を決める（spec §5.4）。応答ヘッダの初期値は交換点が決める
import type { JsonPrimitive } from '../../platform/contract';
import type { FixtureGenerator } from '../../runtimes/browser/app-module';
import { random } from '../shared/random';
import { HEADERS_HOOK, type ProvisionHeaders } from './hooks';

/** alice・bob は利用者。admin は掲示板の管理者（サーバの設定を変えられる）。演習は、先頭の利用者の画面から始まる */
export const USERS = ['alice', 'bob', 'admin'] as const;
export const ADMIN = 'admin';

/**
 * 検証済みの固定の攻撃コメント。ページが用意する無害な実行マーカーを呼ぶだけで、ほかのことはしない。
 * 自由にコメントを書きこむ機能は置かない（任意のスクリプトを書けないようにするため。spec §14）
 */
export const ATTACK_COMMENT = '<script>pqMarker()</script>';
/** 攻撃コメントを書きこんだ、外部の投稿者。ログインする利用者ではない */
const ATTACKER = 'mallory';

const COMMENTS = [
  '来週の読書会は、3 階の会議室です',
  '落とし物のかさを、受付に届けました',
  '金曜日の清掃当番を代わってくれる人を探しています',
  '新しいコーヒー豆、おいしかったです',
  '駐輪場の屋根の工事は、月末までだそうです',
  '写真部の展示が、ロビーで始まりました',
];

export const boardFixture: FixtureGenerator = (db, seed, hook) => {
  const next = random(seed);
  const refs: Record<string, JsonPrimitive> = {};
  const pool = [...COMMENTS];
  const authors = USERS.filter((user) => user !== ADMIN);
  // ふつうのコメントを 2〜4 件。攻撃コメントは、そのあいだのどこかに入る
  const bodies = Array.from({ length: 2 + Math.floor(next() * 3) }, () => pool.splice(Math.floor(next() * pool.length), 1)[0] ?? '');
  const entries = bodies.map((body, i): [string, string] => [authors[(i + Math.floor(next() * 2)) % authors.length] ?? ADMIN, body]);
  entries.splice(Math.floor(next() * (entries.length + 1)), 0, [ATTACKER, ATTACK_COMMENT]);

  let id = 100 + Math.floor(next() * 800);
  for (const [author, body] of entries) {
    db.exec({ sql: 'INSERT INTO comments (id, author, body) VALUES (?, ?, ?)', bind: [id, author, body] });
    id += 1 + Math.floor(next() * 5);
  }
  for (const [name, value] of Object.entries(hook<ProvisionHeaders>(HEADERS_HOOK)())) {
    db.exec({ sql: 'INSERT INTO response_headers (name, value) VALUES (?, ?)', bind: [name, value] });
  }
  refs['comments.count'] = entries.length;
  refs['comments.plain.body'] = bodies[0] ?? '';
  refs['comments.attack.author'] = ATTACKER;
  return refs;
};
