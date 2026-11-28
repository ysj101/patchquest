// 課題「書き換えたトークンを断る」（署名を確かめないログイントークン、CWE-347）。受け取る処理が JWT の中身を読むだけで、
// 署名を確かめずに利用者を決める。中身の名前を書き換えるだけで別の利用者になりすませる事故を題材に、署名を計算し直して比べることを学ぶ。
// トークンは本物の JWT（HS256）で、署名と検証は WebCrypto の HMAC で行う
import type { MissionPack } from '../../platform/contract';
import { IMPLEMENTATIONS } from './implementations';
import { APPROACH, DEBRIEF, HINTS, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { CASES, PROBES, TARGET_CASES } from './tests';

const VERIFY = { id: 'memo.token.verify', contract: 1 };
/** ログイントークン（memo.token.verify）を持つ版から対応する */
const TARGET_APP = { appId: 'memo', versions: '^1.4.0' };
const RECIPE = 'decode-only';

/** 参考差分に載せる、トークンを確かめる処理。トークンを読んだあとの判断（ending）だけが対策ごとに違う */
const checkTokenSource = (ending: string) => `const checkToken = async (ctx, token) => {
  const decoded = decodeToken(token); // ヘッダーと中身を読む。鍵は使わない
  if (!decoded) return { ok: false };
${ending}
};`;
/** 注入した状態（参考差分の変更前） */
const DECODE_ONLY = checkTokenSource('  return { ok: true, subject: decoded.payload.sub };');

export const jwtSignaturePack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'jwt-signature',
    version: '1.0.0',
    kind: 'mission',
    title: '書き換えたトークンを断る',
    summary:
      'ログイントークンの中身を書き換えると、他人のメモが取り出せるという問い合わせを調べます。トークンを分けて中身を読み、書き換えたものを見分けられるように直します。',
    learningObjectives: [
      'トークンを 3 つの部分に分けて中身を読み、書き換えたトークンで他人のメモが取り出せることを再現できる',
      '「署名が付いているかを見る」と「鍵で署名を計算し直して比べる」の違いを説明できる',
      '対策のあとも、本人は自分のトークンで自分のメモを取り出せると確かめられる',
    ],
    estimatedMinutes: 15,
    vulnerability: {
      name: '署名を確かめないトークン',
      plain: 'ログイントークンに書かれた名前を書き換えるだけで、他人になりすませてしまう問題',
      fullName: '暗号署名の不適切な検証',
      cwe: 'CWE-347',
      category: 'authentication',
    },
    difficulty: 'intermediate',
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: { name: 'bob さん', role: 'メモアプリの利用者' },
      incident:
        '利用者の bob さんから問い合わせがありました。「『ログイントークン』の画面で、トークンの中身にある自分の名前を alice さんの名前に書き換えて送ったら、alice さんのメモが出てきました。私のメモも、同じやり方で見られていないか心配です」',
      goal: 'トークンでメモを取り出せるのは、そのトークンを発行してもらった本人だけにします。本人は今までどおり、自分のトークンで自分のメモを取り出せます。',
      protectedAssets: ['トークンを発行してもらった本人だけが取り出せる、メモの中身'],
      normalUse: ['本人は自分のトークンで自分のメモを取り出せる', 'ログインしていない別のアプリからも、トークンを送れば取り出せる'],
    },
    appCompatibility: TARGET_APP,
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview'] },
    hooks: [VERIFY],
    conflicts: [],
    prerequisites: { features: ['login-token'] },
    fixtures: { generator: 'memo.default', variants: [{ id: 'default', label: '標準', recipe: RECIPE }] },
    mutationRecipes: [
      {
        id: RECIPE,
        version: '1.0.0',
        appliesTo: { ...TARGET_APP, hooks: [VERIFY] },
        apply: [{ hook: VERIFY.id, implementation: 'jwt-signature/decode-only' }],
        verify: { probes: PROBES.map((probe) => probe.id) },
        revert: 'baseline',
      },
    ],
    // トークンを分けて読む・書き換える操作は、教材アプリの「ログイントークン」の画面で行う
    actions: [],
    approach: APPROACH,
    defenses: [
      {
        id: 'require-signature',
        label: '署名が付いているトークンだけを受け付ける',
        description: '署名の部分が空のトークンと、「署名なし」（alg が none）と書いたトークンを断ります。署名の値が正しいかは計算しません。',
        apply: [{ hook: VERIFY.id, implementation: 'jwt-signature/require-signature' }],
        referenceDiff: {
          file: 'apps/memo/token.ts',
          language: 'ts',
          before: DECODE_ONLY,
          after: checkTokenSource(
            "  if (decoded.header.alg === 'none' || decoded.parts.signature === '') return { ok: false };\n  return { ok: true, subject: decoded.payload.sub };",
          ),
        },
        whyItFails: '署名が付いていれば、中身を書き換えたトークンでもそのまま通り、他人のメモが取り出せました。',
        expected: 'insufficient',
      },
      {
        id: 'verify-signature',
        label: '鍵で署名を計算し直し、合ったトークンだけを受け付ける',
        description: 'トークンを受け取ったら、サーバだけが知る鍵で、ヘッダーと中身から署名を計算し直します。付いてきた署名と合わなければ、中身を使わずに断ります（401）。',
        apply: [{ hook: VERIFY.id, implementation: 'memo/token-verify-signature' }],
        referenceDiff: {
          file: 'apps/memo/token.ts',
          language: 'ts',
          before: DECODE_ONLY,
          after: checkTokenSource(
            [
              "  const key = await crypto.subtle.importKey('raw', secretOf(ctx), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);",
              "  const signed = new TextEncoder().encode(decoded.parts.header + '.' + decoded.parts.payload);",
              '  // 計算のしかたは HS256 に決めておく。鍵で計算し直した値と、付いてきた署名を比べる',
              "  const valid = decoded.header.alg === 'HS256' && (await crypto.subtle.verify('HMAC', key, signatureOf(decoded), signed));",
              '  if (!valid) return { ok: false };',
              '  return { ok: true, subject: decoded.payload.sub };',
            ].join('\n'),
          ),
        },
        expected: 'secure',
      },
      {
        id: 'reject-all',
        label: 'トークンでの取り出しを、すべて断る',
        description: 'どんなトークンが送られてきても、メモを返さずに断ります。',
        apply: [{ hook: VERIFY.id, implementation: 'jwt-signature/reject-all' }],
        referenceDiff: {
          file: 'apps/memo/token.ts',
          language: 'ts',
          before: DECODE_ONLY,
          after: checkTokenSource('  return { ok: false };'),
        },
        whyItFails: '書き換えたトークンは通らなくなりましたが、本人が自分のトークンで自分のメモを取り出すこともできなくなりました。',
        expected: 'breaks-normal',
      },
    ],
    probes: PROBES,
    tests: {
      target: ['memo.token.forged-denied', 'memo.token.unsigned-denied', ...TARGET_CASES.map((test) => test.id)],
      cases: CASES,
    },
    hints: HINTS,
    solution: SOLUTION,
    transferCheck: TRANSFER_CHECK,
    debrief: DEBRIEF,
  },
  implementations: IMPLEMENTATIONS,
};
