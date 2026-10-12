// 課題パックの検証。カタログ読み込み時とテストで実行し、作者の記述ミスを開始前に止める
import {
  DEFENSE_EXPECTATIONS,
  DIFF_LANGUAGES,
  FIELD_INPUTS,
  GUIDE_ANCHORS,
  GUIDE_MILESTONES,
  MANIFEST_SCHEMA_VERSION,
  PACK_KINDS,
  type MissionPack,
} from './manifest';
import { ANONYMOUS, CAPABILITIES, HTTP_METHODS, type AppDescriptor, type ImplementationRegistry } from './runtime';
import { STEP_KINDS, TEST_CATEGORIES } from './scenario';
import { Checker, isObj } from './checker';
import { isVersion, isVersionRange, satisfies } from './version';

export interface ValidationContext {
  /** 対応する教材アプリ。与えるとフック・機能・利用者・版の整合も確かめる */
  app?: AppDescriptor;
  /** アプリ共通のテスト ID。tests.target が参照できる */
  appTestIds?: readonly string[];
  /** アプリの基準実装など、パック外で登録済みの実装 */
  sharedImplementations?: ImplementationRegistry;
}

const PACK_ID = /^[a-z][a-z0-9-]*$/;
export function validatePack(pack: MissionPack, ctx: ValidationContext = {}): string[] {
  const c = new Checker();
  const m = c.obj('manifest', pack.manifest as unknown);
  const { app } = ctx;

  if (m.schemaVersion !== MANIFEST_SCHEMA_VERSION) c.fail('schemaVersion', `${MANIFEST_SCHEMA_VERSION} が必要です`);
  if (!PACK_ID.test(c.text('id', m.id))) c.fail('id', '小文字・数字・ハイフンで、英字から始めてください');
  if (!isVersion(c.text('version', m.version))) c.fail('version', 'x.y.z 形式が必要です');
  c.oneOf('kind', m.kind, PACK_KINDS);
  c.text('title', m.title);
  c.text('summary', m.summary);
  c.text('solution', m.solution);
  c.texts('learningObjectives', m.learningObjectives, true);
  if (typeof m.estimatedMinutes !== 'number' || !(m.estimatedMinutes > 0)) c.fail('estimatedMinutes', '正の数が必要です');

  const story = c.obj('story', m.story);
  c.text('story.incident', story.incident);
  c.text('story.goal', story.goal);
  c.texts('story.protectedAssets', story.protectedAssets, true);
  c.texts('story.normalUse', story.normalUse, true);

  const compat = c.obj('appCompatibility', m.appCompatibility);
  c.text('appCompatibility.appId', compat.appId);
  if (!isVersionRange(c.text('appCompatibility.versions', compat.versions))) c.fail('appCompatibility.versions', "'x.y.z' か '^x.y.z' が必要です");
  if (app && compat.appId !== app.id) c.fail('appCompatibility.appId', `アプリ「${app.id}」に対応していません`);
  if (app && typeof compat.versions === 'string' && !satisfies(app.version, compat.versions)) {
    c.fail('appCompatibility.versions', `アプリの版 ${app.version} が範囲外です`);
  }

  const runtime = c.obj('runtime', m.runtime);
  c.oneOf('runtime.adapter', runtime.adapter, ['browser']);
  c.list('runtime.capabilities', runtime.capabilities).forEach((cap, i) => c.oneOf(`runtime.capabilities[${i}]`, cap, CAPABILITIES));

  const features = c.texts('prerequisites.features', c.obj('prerequisites', m.prerequisites).features);
  if (app) features.forEach((f, i) => !app.features.includes(f) && c.fail(`prerequisites.features[${i}]`, `アプリに機能「${f}」がありません`));
  c.texts('conflicts', m.conflicts);

  // 交換するフック
  const hookContracts = new Map<string, unknown>();
  const capabilities = Array.isArray(runtime.capabilities) ? runtime.capabilities : [];
  const hooks = c.records('hooks', m.hooks, true, (h, at) => {
    if (!Number.isInteger(h.contract) || (h.contract as number) < 1) c.fail(`${at}.contract`, '1 以上の整数が必要です');
    hookContracts.set(h.id as string, h.contract);
    const declared = app?.hooks.find((d) => d.id === h.id);
    if (app && !declared) c.fail(`${at}.id`, `アプリにフック「${String(h.id)}」がありません`);
    if (declared && declared.contract !== h.contract) c.fail(`${at}.contract`, `アプリのフック契約は ${declared.contract} です`);
    if (declared?.realm === 'view' && !capabilities.includes('dom-preview')) {
      c.fail(`${at}.id`, '画面（view）のフックを交換するには runtime.capabilities に dom-preview が必要です');
    }
  });

  const implementations = { ...ctx.sharedImplementations, ...pack.implementations };
  const checkChanges = (path: string, v: unknown) =>
    c.list(path, v, true).forEach((raw, i) => {
      const change = c.obj(`${path}[${i}]`, raw);
      c.ref(`${path}[${i}].hook`, change.hook, hooks, 'フック');
      const impl = implementations[c.text(`${path}[${i}].implementation`, change.implementation)];
      if (!impl) c.fail(`${path}[${i}].implementation`, `実装「${String(change.implementation)}」が登録されていません`);
      else if (impl.hook !== change.hook) c.fail(`${path}[${i}].implementation`, `実装はフック「${impl.hook}」用です`);
    });

  const actors = app ? new Set([...app.users, ANONYMOUS]) : null;
  const checkSteps = (path: string, v: unknown) =>
    c.list(path, v, true).forEach((raw, i) => {
      const step = c.obj(`${path}[${i}]`, raw);
      c.oneOf(`${path}[${i}].kind`, step.kind, STEP_KINDS);
      const actor = c.text(`${path}[${i}].as`, step.as);
      if (actors && !actors.has(actor)) c.fail(`${path}[${i}].as`, `未定義の利用者「${actor}」です`);
      if (step.kind === 'request') {
        const req = c.obj(`${path}[${i}].request`, step.request);
        c.oneOf(`${path}[${i}].request.method`, req.method, HTTP_METHODS);
        c.text(`${path}[${i}].request.path`, req.path);
      } else {
        c.text(`${path}[${i}].view.route`, c.obj(`${path}[${i}].view`, step.view).route);
      }
    });

  const probes = c.records('probes', m.probes, true, (p, at) => {
    c.text(`${at}.title`, p.title);
    checkSteps(`${at}.steps`, p.steps);
    c.obj(`${at}.detect`, p.detect);
  });

  const recipes = c.records('mutationRecipes', m.mutationRecipes, true, (r, at) => {
    if (!isVersion(c.text(`${at}.version`, r.version))) c.fail(`${at}.version`, 'x.y.z 形式が必要です');
    const applies = c.obj(`${at}.appliesTo`, r.appliesTo);
    if (applies.appId !== compat.appId) c.fail(`${at}.appliesTo.appId`, 'appCompatibility.appId と一致しません');
    if (!isVersionRange(c.text(`${at}.appliesTo.versions`, applies.versions))) c.fail(`${at}.appliesTo.versions`, "'x.y.z' か '^x.y.z' が必要です");
    c.list(`${at}.appliesTo.hooks`, applies.hooks, true).forEach((raw, i) => {
      const h = c.obj(`${at}.appliesTo.hooks[${i}]`, raw);
      if (hookContracts.get(h.id as string) !== h.contract) c.fail(`${at}.appliesTo.hooks[${i}]`, 'hooks の宣言と一致しません');
    });
    checkChanges(`${at}.apply`, r.apply);
    c.list(`${at}.verify.probes`, c.obj(`${at}.verify`, r.verify).probes, true).forEach((id, i) =>
      c.ref(`${at}.verify.probes[${i}]`, id, probes, 'probe'),
    );
    c.oneOf(`${at}.revert`, r.revert, ['baseline']);
  });

  const fixtures = c.obj('fixtures', m.fixtures);
  c.text('fixtures.generator', fixtures.generator);
  c.records('fixtures.variants', fixtures.variants, true, (v, at) => {
    c.text(`${at}.label`, v.label);
    c.ref(`${at}.recipe`, v.recipe, recipes, 'レシピ');
  });

  c.records('actions', m.actions, false, (a, at) => {
    c.text(`${at}.label`, a.label);
    c.text(`${at}.description`, a.description);
    const req = c.obj(`${at}.request`, a.request);
    c.oneOf(`${at}.request.method`, req.method, HTTP_METHODS);
    c.text(`${at}.request.path`, req.path);
    if (typeof a.editable !== 'boolean') c.fail(`${at}.editable`, '真偽値が必要です');
    c.records(`${at}.fields`, a.fields, false, (f, fat) => {
      c.text(`${fat}.label`, f.label);
      c.oneOf(`${fat}.input`, f.input, FIELD_INPUTS);
      if (f.input === 'select') c.list(`${fat}.options`, f.options, true);
    }, 'name');
  });

  const expectations: unknown[] = [];
  c.records('defenses', m.defenses, true, (d, at) => {
    c.text(`${at}.label`, d.label);
    c.text(`${at}.description`, d.description);
    checkChanges(`${at}.apply`, d.apply);
    const diff = c.obj(`${at}.referenceDiff`, d.referenceDiff);
    c.text(`${at}.referenceDiff.file`, diff.file);
    c.oneOf(`${at}.referenceDiff.language`, diff.language, DIFF_LANGUAGES);
    c.text(`${at}.referenceDiff.before`, diff.before);
    c.text(`${at}.referenceDiff.after`, diff.after);
    c.oneOf(`${at}.expected`, d.expected, DEFENSE_EXPECTATIONS);
    expectations.push(d.expected);
  });
  if (!expectations.includes('secure')) c.fail('defenses', "expected が 'secure' の対策が1つ以上必要です");

  const tests = c.obj('tests', m.tests);
  const cases = c.records('tests.cases', tests.cases, false, (t, at) => {
    c.oneOf(`${at}.category`, t.category, TEST_CATEGORIES);
    c.text(`${at}.title`, t.title);
    checkSteps(`${at}.steps`, t.steps);
  });
  const knownTests = new Set([...cases, ...(ctx.appTestIds ?? [])]);
  c.texts('tests.target', tests.target, true).forEach((id, i) => {
    if (ctx.appTestIds || cases.has(id)) c.ref(`tests.target[${i}]`, id, knownTests, 'テスト');
  });

  const levels = c.list('hints', m.hints).map((raw, i) => {
    const h = c.obj(`hints[${i}]`, raw);
    c.text(`hints[${i}].text`, h.text);
    return h.level;
  });
  if (levels.length !== 3 || ![1, 2, 3].every((l) => levels.includes(l))) c.fail('hints', 'level 1・2・3 を1件ずつ定義してください');

  c.records('transferCheck', m.transferCheck, true, (q, at) => {
    c.text(`${at}.situation`, q.situation);
    c.text(`${at}.prompt`, q.prompt);
    const choices = c.list(`${at}.choices`, q.choices);
    if (choices.length < 2) c.fail(`${at}.choices`, '2件以上必要です');
    c.records(`${at}.choices`, choices, false, (ch, cat) => {
      c.text(`${cat}.label`, ch.label);
      c.text(`${cat}.explanation`, ch.explanation);
      if (typeof ch.correct !== 'boolean') c.fail(`${cat}.correct`, '真偽値が必要です');
    });
    if (!choices.some((ch) => isObj(ch) && ch.correct === true)) c.fail(`${at}.choices`, '正解の選択肢が必要です');
  });

  const debrief = c.obj('debrief', m.debrief);
  c.text('debrief.cause', debrief.cause);
  c.text('debrief.defenseRationale', debrief.defenseRationale);
  c.texts('debrief.takeaways', debrief.takeaways, true);

  if (m.kind === 'tutorial' || m.guide !== undefined) {
    c.records('guide', m.guide, m.kind === 'tutorial', (g, at) => {
      c.text(`${at}.title`, g.title);
      c.text(`${at}.body`, g.body);
      c.oneOf(`${at}.anchor`, g.anchor, GUIDE_ANCHORS);
      c.oneOf(`${at}.until`, g.until, GUIDE_MILESTONES);
      if (g.praise !== undefined) c.text(`${at}.praise`, g.praise);
      if (g.retry !== undefined) {
        const retry = c.obj(`${at}.retry`, g.retry);
        c.oneOf(`${at}.retry.when`, retry.when, GUIDE_MILESTONES);
        c.text(`${at}.retry.text`, retry.text);
      }
    });
  }

  return c.errors;
}
