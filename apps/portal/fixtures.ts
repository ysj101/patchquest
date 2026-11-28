// 架空の初期データ。seed から、お知らせの番号と並びを決める（spec §5.4）。利用者は、はじめは全員サインインしていない
import type { JsonPrimitive } from '../../platform/contract';
import type { FixtureGenerator } from '../../runtimes/browser/app-module';
import { random } from '../shared/random';

export const USERS = ['bob', 'alice'] as const;

const NOTICES = [
  ['経費精算の締め切り', '今月の経費は、25 日までに申請してください。'],
  ['健康診断の日程', '健康診断は、来月の第 2 週に行います。'],
  ['社内システムの停止', '土曜日の夜に、社内システムを 2 時間止めます。'],
  ['防災訓練のお知らせ', '来週の水曜日に、防災訓練を行います。'],
  ['年末の休業日', '年末は 29 日から休業します。'],
] as const;

/** テストとパックが {{notices.first.id}} のように参照する名前（番号の小さい順） */
const NAMES = ['first', 'second', 'third'] as const;

export const portalFixture: FixtureGenerator = (db, seed) => {
  const next = random(seed);
  const refs: Record<string, JsonPrimitive> = {};
  for (const key of USERS) db.exec({ sql: 'INSERT INTO users (key) VALUES (?)', bind: [key] });

  // お知らせは 5 件から 3 件を選ぶ。番号は 2 桁から始まる連番で、seed ごとに変わる
  const pool = [...NOTICES];
  let id = 10 + Math.floor(next() * 80);
  for (const name of NAMES) {
    const [picked] = pool.splice(Math.floor(next() * pool.length), 1);
    if (!picked) throw new Error('お知らせの候補が足りません');
    id += 1;
    db.exec({ sql: 'INSERT INTO notices (id, title, body) VALUES (?, ?, ?)', bind: [id, picked[0], picked[1]] });
    refs[`notices.${name}.id`] = id;
    refs[`notices.${name}.title`] = picked[0];
  }
  refs['notices.missing.id'] = id + 100;
  return refs;
};
