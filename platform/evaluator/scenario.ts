// 手順データ（Step）を実行し、期待との差を判定する。テスト・probe・プレイヤー操作の判定で共通に使う
import type {
  ActorKey,
  AppRequest,
  AppResponse,
  Condition,
  EventExpectation,
  Exchange,
  ExchangeMatcher,
  JsonPrimitive,
  JsonValue,
  Matcher,
  ObservedEvent,
  ResponseExpectation,
  SessionToken,
  Step,
  ViewTarget,
} from '../contract';

/** テンプレートが参照できる値。fixture の refs と、capture で取り出した 'capture.名前' */
export type Scope = Record<string, JsonPrimitive>;

export class ScenarioError extends Error {
  override name = 'ScenarioError';
}

const PLACEHOLDER = /\{\{([^{}]+)\}\}/g;
const WHOLE_PLACEHOLDER = /^\{\{([^{}]+)\}\}$/;

function lookup(scope: Scope, key: string): JsonPrimitive {
  const k = key.trim();
  if (!(k in scope)) throw new ScenarioError(`未定義の値 {{${k}}} を参照しています`);
  return scope[k]!;
}

/** 型付きの定義（Condition・AppRequest など）を展開する */
function expandAs<T>(value: T, scope: Scope): T {
  return expand(value as unknown as JsonValue, scope) as unknown as T;
}

/** 文字列中の {{キー}} を置き換える。文字列全体が 1 つの {{キー}} なら値の型を保つ */
export function expand(value: JsonValue, scope: Scope): JsonValue {
  if (typeof value === 'string') {
    const whole = value.match(WHOLE_PLACEHOLDER);
    if (whole) return lookup(scope, whole[1]!);
    return value.replace(PLACEHOLDER, (_, key: string) => String(lookup(scope, key)));
  }
  if (Array.isArray(value)) return value.map((v) => expand(v, scope));
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v, scope)]));
  return value;
}

/** path の値を集める。'' は全体、'*' は配列の全要素を指す */
export function select(root: JsonValue | undefined, path: string): { values: (JsonValue | undefined)[]; wildcard: boolean } {
  let values: (JsonValue | undefined)[] = [root];
  let wildcard = false;
  for (const segment of path === '' ? [] : path.split('.')) {
    if (segment === '*') {
      wildcard = true;
      values = values.flatMap((v) => (Array.isArray(v) ? v : []));
    } else {
      values = values.map((v) => {
        if (Array.isArray(v)) return /^\d+$/.test(segment) ? v[Number(segment)] : undefined;
        return v !== null && typeof v === 'object' ? v[segment] : undefined;
      });
    }
  }
  return { values, wildcard };
}

function deepEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

const asText = (v: JsonValue | undefined) => (typeof v === 'string' ? v : JSON.stringify(v ?? null));
const lengthOf = (v: JsonValue | undefined) => (typeof v === 'string' ? [...v].length : Array.isArray(v) ? v.length : null);

export function satisfiesCondition(condition: Condition, value: JsonValue | undefined): boolean {
  if ('equals' in condition) return deepEqual(value, condition.equals);
  if ('notEquals' in condition) return !deepEqual(value, condition.notEquals);
  if ('oneOf' in condition) return condition.oneOf.some((c) => deepEqual(value, c));
  if ('contains' in condition) return asText(value).includes(condition.contains);
  if ('notContains' in condition) return !asText(value).includes(condition.notContains);
  if ('minLength' in condition) return (lengthOf(value) ?? -1) >= condition.minLength;
  if ('maxLength' in condition) return (lengthOf(value) ?? Infinity) <= condition.maxLength;
  return (value !== undefined) === condition.exists;
}

export function describeCondition(condition: Condition): string {
  const [[op, operand]] = Object.entries(condition) as [[string, JsonValue]];
  const labels: Record<string, string> = {
    equals: '＝',
    notEquals: '≠',
    oneOf: 'いずれか',
    contains: 'を含む',
    notContains: 'を含まない',
    minLength: '長さ ≥',
    maxLength: '長さ ≤',
    exists: '存在',
  };
  return `${labels[op] ?? op} ${JSON.stringify(operand)}`;
}

const preview = (v: unknown) => {
  const text = JSON.stringify(v ?? null);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

/** 条件を満たさない matcher ごとに、期待と実測を説明する文を返す */
function checkMatchers(root: JsonValue | undefined, matchers: Matcher[], scope: Scope): string[] {
  const failures: string[] = [];
  for (const m of matchers) {
    const condition = expandAs(m.is, scope);
    const { values, wildcard } = select(root, m.path);
    const ok = wildcard ? values.every((v) => satisfiesCondition(condition, v)) : satisfiesCondition(condition, values[0]);
    if (!ok) failures.push(`${m.path || '(全体)'} が ${describeCondition(condition)} ではない（実測 ${preview(wildcard ? values : values[0])}）`);
  }
  return failures;
}

export function checkResponse(response: AppResponse, expectation: ResponseExpectation, scope: Scope): string[] {
  const failures: string[] = [];
  if (expectation.status !== undefined) {
    const allowed = Array.isArray(expectation.status) ? expectation.status : [expectation.status];
    if (!allowed.includes(response.status)) failures.push(`status が ${allowed.join(' か ')} ではない（実測 ${response.status}）`);
  }
  return [...failures, ...checkMatchers(response.body, expectation.body ?? [], scope)];
}

export function checkEvents(events: ObservedEvent[], expectations: EventExpectation[], scope: Scope): string[] {
  const failures: string[] = [];
  for (const exp of expectations) {
    const found = events.some((e) => e.type === exp.type && checkMatchers(e.data, exp.where ?? [], scope).length === 0);
    if ((exp.presence ?? 'present') === 'present' && !found) failures.push(`観測イベント ${exp.type} が条件どおりに発生していない`);
    if (exp.presence === 'absent' && found) failures.push(`観測イベント ${exp.type} が発生した`);
  }
  return failures;
}

export interface ScenarioInvoker {
  /** 信頼された演習ハーネスとしてセッションを発行する。未ログインは null */
  session(actor: ActorKey): Promise<SessionToken | null>;
  request(session: SessionToken | null, request: AppRequest): Promise<{ response: AppResponse; events: ObservedEvent[] }>;
  render(session: SessionToken | null, view: ViewTarget): Promise<{ events: ObservedEvent[] }>;
}

export interface ScenarioResult {
  passed: boolean;
  /** 判定した手順の期待 */
  expected: string;
  /** 実測。不合格なら期待との差 */
  actual: string;
}

function describeRequest(step: Extract<Step, { kind: 'request' }>, request: AppRequest): string {
  const status = step.expect?.status;
  const want = status === undefined ? '' : ` → status ${Array.isArray(status) ? status.join(' か ') : status}`;
  return `${step.as} が ${request.method} ${request.path}${want}`;
}

/** 手順を順に実行する。最初に期待と違った手順で止め、その差を返す */
export async function runSteps(steps: Step[], refs: Scope, invoker: ScenarioInvoker): Promise<ScenarioResult> {
  const scope: Scope = { ...refs };
  const sessions = new Map<ActorKey, SessionToken | null>();
  const sessionFor = async (actor: ActorKey) => {
    if (!sessions.has(actor)) sessions.set(actor, await invoker.session(actor));
    return sessions.get(actor)!;
  };
  let last: ScenarioResult = { passed: true, expected: '手順なし', actual: '—' };

  for (const step of steps) {
    if (step.kind === 'render') {
      const expected = `${step.as} が画面 ${step.view.route} を表示`;
      const { events } = await invoker.render(await sessionFor(step.as), step.view);
      const failures = checkEvents(events, step.events ?? [], scope);
      if (failures.length) return { passed: false, expected, actual: failures.join(' / ') };
      last = { passed: true, expected, actual: `観測イベント ${events.length} 件` };
      continue;
    }

    let request: AppRequest;
    try {
      request = expandAs(step.request, scope);
    } catch (e) {
      return { passed: false, expected: '手順の展開', actual: e instanceof Error ? e.message : String(e) };
    }
    const expected = describeRequest(step, request);
    const { response, events } = await invoker.request(await sessionFor(step.as), request);
    const failures = [...checkResponse(response, step.expect ?? {}, scope), ...checkEvents(events, step.events ?? [], scope)];
    if (failures.length) return { passed: false, expected, actual: failures.join(' / ') };
    for (const [name, path] of Object.entries(step.capture ?? {})) {
      const value = select(response.body, path).values[0];
      if (value === undefined || (value !== null && typeof value === 'object')) {
        return { passed: false, expected, actual: `capture.${name}（${path}）を取り出せない` };
      }
      scope[`capture.${name}`] = value;
    }
    last = { passed: true, expected, actual: `status ${response.status}` };
  }
  return last;
}

/** path の '*' は 1 セグメントに一致する */
function pathMatches(pattern: string, path: string): boolean {
  const p = pattern.split('/');
  const a = path.split('?')[0]!.split('/');
  return p.length === a.length && p.every((segment, i) => segment === '*' || segment === a[i]);
}

/** 観測した 1 回のやり取りが条件に合うか（プレイヤー自身の操作による再現の判定） */
export function matchesExchange(exchange: Exchange, matcher: ExchangeMatcher, scope: Scope): boolean {
  try {
    if (matcher.actor?.is !== undefined && exchange.actor !== matcher.actor.is) return false;
    if (matcher.actor?.not !== undefined && exchange.actor === matcher.actor.not) return false;
    if (matcher.kind && exchange.kind !== matcher.kind) return false;
    if (matcher.request) {
      if (!exchange.request) return false;
      if (matcher.request.method && exchange.request.method !== matcher.request.method) return false;
      if (matcher.request.path && !pathMatches(String(expandAs(matcher.request.path, scope)), exchange.request.path)) return false;
    }
    if (matcher.response && (!exchange.response || checkResponse(exchange.response, matcher.response, scope).length > 0)) return false;
    return checkEvents(exchange.events, matcher.events ?? [], scope).length === 0;
  } catch (e) {
    if (e instanceof ScenarioError) return false;
    throw e;
  }
}
