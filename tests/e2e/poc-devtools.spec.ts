// PoC（Issue #236）：教材アプリの画面側（隔離 iframe）とサーバ役（Worker）が、Chrome の DevTools と同じ経路（CDP）からどう見えるかを確かめる。
// 記録は docs/poc/client-secret-devtools.md
import type { CDPSession, Page } from '@playwright/test';
import { expect, preview, startMission, test } from './fixtures';

/** 課題「非公開メモを守る」を始め、bob に切り替える。alice の非公開メモは、bob の画面には届いていない */
async function startAsBob(page: Page): Promise<void> {
  await startMission(page, 'idor');
  await page.getByRole('radio', { name: /^bob/ }).check();
  await expect(preview(page).getByText('bob さんとしてログイン中')).toBeVisible();
}

/** 教材アプリの枠（別のプロセスで動く）につないだ CDP のセッション。DevTools が枠を調べるときと同じ経路 */
async function frameSession(page: Page): Promise<CDPSession> {
  const frame = await (await page.locator('.preview-slot iframe').elementHandle()).contentFrame();
  if (!frame) throw new Error('教材アプリの枠がありません');
  return page.context().newCDPSession(frame);
}

/** 並びの先頭。空なら、確かめる前提が崩れているので止める */
function first<T>(items: readonly T[], what: string): T {
  const [item] = items;
  if (item === undefined) throw new Error(`${what}がありません`);
  return item;
}

type Reply = { id?: number; method?: string; result?: unknown; params?: unknown };
type Scope = { type: string; object: { objectId: string } };
type Paused = { callFrames: { scopeChain: Scope[] }[] };
type Properties = { result: { name: string; value?: { type: string; objectId?: string } }[] };

/** ページの下の Worker（サーバ役）へ、CDP の命令を送る手段。DevTools が Worker を調べるときと同じ経路 */
async function workerDebugger(page: Page) {
  const client = await page.context().newCDPSession(page);
  const workers: string[] = [];
  const waiting = new Map<number, (result: unknown) => void>();
  const paused: { worker: string; at: Paused }[] = [];
  let nextId = 1;
  client.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => void (targetInfo.type === 'worker' && workers.push(sessionId)));
  client.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
    const reply = JSON.parse(message) as Reply;
    if (reply.method === 'Debugger.paused') paused.push({ worker: sessionId, at: reply.params as Paused });
    if (reply.id !== undefined) waiting.get(reply.id)?.(reply.result);
  });
  await client.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
  const send = <T>(worker: string, method: string, params: object = {}): Promise<T> => {
    const id = nextId++;
    const result = new Promise<T>((resolve) => waiting.set(id, resolve as (result: unknown) => void));
    return client.send('Target.sendMessageToTarget', { sessionId: worker, message: JSON.stringify({ id, method, params }) }).then(() => result);
  };
  return { workers, paused, send };
}

/** 止まった場所から見える変数のうち、教材ロジックのデータベースを持つものを探し、非公開メモの持ち主と本文を読む */
const READ_PRIVATE_MEMOS = `function () {
  const db = this && this.state && this.state.db;
  if (!db || typeof db.selectObjects !== 'function') return null;
  return JSON.stringify(db.selectObjects("SELECT u.key AS owner, m.body FROM memos m JOIN users u ON u.id = m.owner_id WHERE m.title = '非公開のメモ' ORDER BY m.id"));
}`;

test('教材アプリの画面からの問い合わせは、DevTools と同じ経路（CDP の Network）に通信として現れない', async ({ page }) => {
  await startAsBob(page);
  const requests: string[] = [];
  for (const session of [await page.context().newCDPSession(page), await frameSession(page)]) {
    await session.send('Network.enable');
    session.on('Network.requestWillBeSent', ({ request }) => requests.push(request.url));
  }

  // 画面からメモを 1 件取り出す。応答は届いて、本文が出る
  await preview(page).getByRole('button', { name: '非公開のメモ' }).click();
  await expect(preview(page).getByText('（bob）')).toBeVisible();

  expect(requests).toEqual([]);
});

test('枠のスクリプトは、ビルド時に決まる 1 本で、サーバ役の処理も入っている。Worker には、元のソースへの対応表が付いている', async ({ page }) => {
  await startAsBob(page);
  const session = await frameSession(page);
  const scripts: { scriptId: string; url: string; sourceMapURL?: string }[] = [];
  session.on('Debugger.scriptParsed', (script) => void (script.url !== '' && scripts.push(script)));
  await session.send('Debugger.enable');
  await expect.poll(() => scripts.map((script) => [new URL(script.url).pathname, script.sourceMapURL])).toEqual([['/assets/preview.html', '']]);

  // 枠に届いているスクリプトは、配信している静的なファイルに埋め込んだもの。演習や選んだ対策によって変わらない
  const { scriptSource } = await session.send('Debugger.getScriptSource', { scriptId: first(scripts, '枠のスクリプト').scriptId });
  expect(await (await page.request.get('/assets/preview.html')).text()).toContain(scriptSource);
  // サーバ役（Worker）で動く検索クエリと、別の教材アプリ（Linux 端末）の語も入っている
  expect(scriptSource).toContain('owner_id = ?');
  expect(scriptSource).toContain('sudoers');

  // Worker のスクリプトには対応表（ソースマップ）が付き、元のソース（課題の解法の文を含む）を読める
  const map = (await (await page.request.get('/assets/runtime-worker.js.map')).json()) as { sources: string[]; sourcesContent: string[] };
  const original = (file: string) => map.sourcesContent[map.sources.findIndex((source) => source.endsWith(file))];
  expect(original('apps/memo/server.ts')).toContain('export function handle');
  expect(original('missions/idor/learning.ts')).toContain('defenseRationale');
});

test('サーバ役の Worker にしかない値（別の利用者の非公開メモ）を、DevTools と同じ経路（CDP の Debugger）で読める', async ({ page }) => {
  await startAsBob(page);
  const { workers, paused, send } = await workerDebugger(page);
  await expect.poll(() => workers.length).toBeGreaterThan(0);
  for (const worker of workers) {
    await send(worker, 'Debugger.enable');
    await send(worker, 'Debugger.pause');
  }

  // 画面を操作すると、演習用の Worker が、次に動かす文で止まる
  await preview(page).getByRole('button', { name: '非公開のメモ' }).click();
  await expect.poll(() => paused.length).toBe(1);
  const { worker, at } = first(paused, '止まった Worker');
  const found: string[] = [];
  for (const scope of first(at.callFrames, '止まった場所').scopeChain.filter((candidate) => candidate.type === 'module')) {
    const { result } = await send<Properties>(worker, 'Runtime.getProperties', { objectId: scope.object.objectId });
    for (const { value } of result) {
      if (value?.type !== 'object' || value.objectId === undefined) continue;
      const read = await send<{ result: { value?: string | null } }>(worker, 'Runtime.callFunctionOn', { objectId: value.objectId, functionDeclaration: READ_PRIVATE_MEMOS, returnByValue: true });
      if (typeof read.result.value === 'string') found.push(read.result.value);
    }
  }
  await send(worker, 'Debugger.resume');

  // bob の画面には bob のメモだけが出るが、Worker のメモリからは alice と carol の非公開メモの本文も読める
  await expect(preview(page).getByText('（bob）')).toBeVisible();
  expect(found).toHaveLength(1);
  expect((JSON.parse(first(found, '読めた値')) as { owner: string; body: string }[]).map((memo) => [memo.owner, memo.body.endsWith(`（${memo.owner}）`)])).toEqual([
    ['alice', true],
    ['bob', true],
    ['carol', true],
  ]);
});
