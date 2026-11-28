// ミッション「スタンプが勝手に付くのを防ぐ」（送信元を確かめない postMessage、Issue #235）。
// Node では iframe を開かないため、受け取る処理の切り替えと再現の判定をここで確かめ、本物のメッセージでの確認は E2E で行う
import { describe, expect, it } from 'vitest';
import { describeEvent } from '../../../apps/memo/events';
import { BASELINE, STAMPS, readStamp, type AcceptStamp } from '../../../apps/memo/hooks';
import type { Exchange } from '../../../platform/contract';
import { detectReproduction } from '../../../platform/evaluator/evaluator';
import { postmessageOriginPack } from '..';

const { manifest, implementations } = postmessageOriginPack;
const STAMP = STAMPS[0];

/** 窓の代わり。受け取る処理は、同じ窓かどうかだけを見る */
const pickerWindow = {} as Window;
const adWindow = {} as Window;
const picker = { contentWindow: pickerWindow } as HTMLIFrameElement;
/** sandbox の中のページから届いたメッセージ（オリジンは "null"） */
const message = (source: Window, origin = 'null', data: unknown = { type: 'stamp', stamp: STAMP }) => ({ source, origin, data }) as MessageEvent;

const accept = (id: string) => ({ ...BASELINE, ...implementations })[id]?.run as AcceptStamp;

describe('メッセージの中身の確かめ', () => {
  it('選べるスタンプを指す形のメッセージだけを、スタンプとして読む', () => {
    expect(readStamp({ type: 'stamp', stamp: STAMP })).toBe(STAMP);
    expect(readStamp({ type: 'stamp', stamp: '当選しました' })).toBeNull();
    expect(readStamp({ type: 'other', stamp: STAMP })).toBeNull();
    expect(readStamp({ type: 'stamp' })).toBeNull();
    expect(readStamp(STAMP)).toBeNull();
    expect(readStamp(null)).toBeNull();
  });
});

describe('届いたメッセージを受け入れる処理', () => {
  it('注入する実装は、広告の窓から届いたメッセージも受け入れる', () => {
    const run = accept('postmessage-origin/accept-any-sender');
    expect(run(message(adWindow), picker)).toBe(STAMP);
    expect(run(message(pickerWindow), picker)).toBe(STAMP);
  });

  it('基準実装は、スタンプの部品の窓から届いたメッセージだけを受け入れる', () => {
    const run = accept('memo/stamp-from-picker');
    expect(run(message(adWindow), picker)).toBeNull();
    expect(run(message(pickerWindow), picker)).toBe(STAMP);
    expect(run(message(pickerWindow, 'null', { type: 'stamp', stamp: '当選しました' }), picker)).toBeNull();
  });

  it('オリジンが "null" かを確かめるだけでは、同じ "null" の広告を捨てられない', () => {
    const run = accept('postmessage-origin/null-origin');
    expect(run(message(adWindow), picker)).toBe(STAMP);
    expect(run(message(adWindow, 'https://ad.example.test'), picker)).toBeNull();
  });

  it('すべて捨てる実装は、スタンプの部品のメッセージも捨てる', () => {
    const run = accept('postmessage-origin/drop-all');
    expect(run(message(pickerWindow), picker)).toBeNull();
    expect(run(message(adWindow), picker)).toBeNull();
  });
});

describe('観測ログの表示', () => {
  const event = (sender: string, accepted: boolean) => ({ type: 'message.received', data: { sender, origin: 'null', data: '{"type":"stamp","stamp":"いいね！"}', accepted } });

  it('届いたメッセージの中身・送り主の窓・送り主のオリジン・結果を示す', () => {
    expect(describeEvent(event('ad', true))).toBe(
      '届いたメッセージ：{"type":"stamp","stamp":"いいね！"} → 受け入れた\n送り主の窓（event.source）：広告の枠\n送り主のオリジン（event.origin）："null"\n結果：受け入れた（スタンプを書き込んだ）',
    );
    expect(describeEvent(event('picker', false))).toContain('送り主の窓（event.source）：スタンプの部品');
    expect(describeEvent(event('picker', false))).toContain('{"type":"stamp","stamp":"いいね！"} → 捨てた\n');
    expect(describeEvent(event('picker', false))).toContain('結果：捨てた（何も書き込まない）');
  });
});

describe('再現の判定', () => {
  const opened = (actor: string, sender: string, accepted: boolean): Exchange => ({
    runId: 'r1',
    actor,
    kind: 'render',
    route: '/pages/1/stamps',
    events: [{ type: 'message.received', data: { sender, origin: 'null', data: '{}', accepted } }],
  });

  it('広告の窓から届いたメッセージを受け入れたら、その画面を開いていた利用者の probe で再現とみなす', () => {
    expect(detectReproduction(opened('alice', 'ad', true), manifest.probes, {})).toBe('ad-stamps-as-alice');
    expect(detectReproduction(opened('bob', 'ad', true), manifest.probes, {})).toBe('ad-stamps-as-bob');
    expect(detectReproduction(opened('carol', 'ad', true), manifest.probes, {})).toBe('ad-stamps-as-carol');
  });

  it('スタンプの部品のメッセージを受け入れただけ・広告のメッセージを捨てたときは、再現にしない', () => {
    expect(detectReproduction(opened('carol', 'picker', true), manifest.probes, {})).toBeNull();
    expect(detectReproduction(opened('carol', 'ad', false), manifest.probes, {})).toBeNull();
  });
});
