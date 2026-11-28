// ミッション「サインインのあとの行き先を守る」（オープンリダイレクト）。サインインのあとの行き先を、アドレスの next の値のまま
// Location に入れる実装へ切り替える。応答は Service Worker が本物の HTTP 応答として返し、ブラウザが実際に従う（必要機能 http）
import type { MissionPack } from '../../platform/contract';
import { IMPLEMENTATIONS } from './implementations';
import { APPROACH, DEBRIEF, HINTS, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { CASES, PROBES, TARGET_CASES } from './tests';

const REDIRECT = { id: 'portal.signin.redirect', contract: 1 };
const TARGET_APP = { appId: 'portal', versions: '^1.0.0' };
const RECIPE = 'unchecked-next';
const FILE = 'apps/portal/hooks.ts';

/** 注入した状態（参考差分の変更前） */
const UNCHECKED = "const pickRedirect = (next) => next ?? '/';";

export const openRedirectPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'open-redirect',
    version: '1.0.0',
    kind: 'mission',
    title: 'サインインのあとの行き先を守る',
    summary: '「本物のポータルのリンクを開いたのに、サインインしたら知らないサイトに移動した」という問い合わせを調べます。サーバが返す行き先を見て、直します。',
    learningObjectives: [
      'サインインの応答（302 と Location）を見て、ブラウザがどこへ移動させられるかを説明できる',
      'アドレスの next の値を変えて、外のサイトへ移動させられることを再現できる',
      '「1 文字目が / かを見る」と「URL として読んで、このサイトの中かを確かめる」の違いを説明できる',
    ],
    estimatedMinutes: 15,
    vulnerability: { name: 'オープンリダイレクト', plain: '本物のサイトのリンクなのに、開くと知らないサイトへ送られてしまう問題', fullName: '信頼できないサイトへの URL リダイレクト', cwe: 'CWE-601', category: 'input-validation' },
    difficulty: 'intermediate',
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: { name: 'bob さん', role: '社内ポータルの利用者' },
      incident:
        '社員の bob さんから問い合わせがありました。「メールのリンクから社内ポータルを開きました。アドレスの先頭は、本物のポータルでした。でもサインインしたら、見たことのないサイトに移動して、もう一度パスワードを聞かれました」',
      goal: 'サインインのあとに、外のサイトへ移動させないようにします。サインインの前に開こうとしていたページへは、今までどおり戻れます。',
      protectedAssets: ['サインインした人が、外のサイトへ送られないこと'],
      normalUse: ['サインインのあと、開こうとしていたお知らせへ戻れる'],
    },
    appCompatibility: TARGET_APP,
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'http'] },
    hooks: [REDIRECT],
    conflicts: [],
    prerequisites: { features: ['signin'] },
    fixtures: { generator: 'portal.default', variants: [{ id: 'default', label: '標準', recipe: RECIPE }] },
    mutationRecipes: [
      {
        id: RECIPE,
        version: '1.0.0',
        appliesTo: { ...TARGET_APP, hooks: [REDIRECT] },
        apply: [{ hook: REDIRECT.id, implementation: 'open-redirect/unchecked' }],
        verify: { probes: PROBES.map((probe) => probe.id) },
        revert: 'baseline',
      },
    ],
    // 操作はすべて教材アプリの画面（リンク・フォーム・アドレス欄）から行う
    actions: [],
    approach: APPROACH,
    defenses: [
      {
        id: 'prefix-slash',
        label: '行き先の 1 文字目が / のときだけ従う',
        description: '行き先の 1 文字目が / かを確かめます。/ で始まらないときは、トップへ送ります。',
        apply: [{ hook: REDIRECT.id, implementation: 'open-redirect/prefix-slash' }],
        referenceDiff: { file: FILE, language: 'ts', before: UNCHECKED, after: "const pickRedirect = (next) => (next?.startsWith('/') ? next : '/');" },
        whyItFails: '// や /\\ で始まる行き先は、1 文字目が / なのでそのまま通りました。ブラウザは、これを外のサイトのアドレスとして読みます。',
        expected: 'insufficient',
      },
      {
        id: 'same-site',
        label: '行き先を URL として読み、このサイトの中のときだけ従う',
        description: '行き先を、ブラウザと同じ読み方（URL の解析）で読みます。読んだ結果がこのサイトの中のときだけ従い、外のサイトのときはトップへ送ります。',
        apply: [{ hook: REDIRECT.id, implementation: 'portal/redirect-same-site' }],
        referenceDiff: {
          file: FILE,
          language: 'ts',
          before: UNCHECKED,
          after:
            "const pickRedirect = (next) => {\n  if (next === null || !URL.canParse(next, SITE_ORIGIN)) return '/';\n  // ブラウザと同じ読み方で、行き先をこのサイトのアドレスとして読む\n  const target = new URL(next, SITE_ORIGIN);\n  return target.origin === SITE_ORIGIN ? next : '/';\n};",
        },
        expected: 'secure',
      },
      {
        id: 'always-home',
        label: 'サインインのあとは、いつもトップへ送る',
        description: '行き先の値を使うのをやめて、サインインのあとは、いつもトップへ送ります。',
        apply: [{ hook: REDIRECT.id, implementation: 'open-redirect/always-home' }],
        referenceDiff: { file: FILE, language: 'ts', before: UNCHECKED, after: "const pickRedirect = () => '/';" },
        whyItFails: '外のサイトへは移動しなくなりましたが、サインインのあと、開こうとしていたお知らせへ戻れなくなりました。',
        expected: 'breaks-normal',
      },
    ],
    probes: PROBES,
    tests: {
      target: ['portal.redirect.absolute', 'portal.redirect.scheme-relative', 'portal.redirect.backslash', ...TARGET_CASES.map((test) => test.id)],
      cases: CASES,
    },
    hints: HINTS,
    solution: SOLUTION,
    transferCheck: TRANSFER_CHECK,
    debrief: DEBRIEF,
  },
  implementations: IMPLEMENTATIONS,
};
