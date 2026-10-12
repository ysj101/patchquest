// 攻撃の成立条件（probe）とテストを、実行可能なコードではなくデータで書くための形式（spec §11.1）
import type { JsonValue } from './json';
import type { ActorKey, HttpMethod, ViewTarget } from './runtime';

/**
 * 文字列中の {{キー}} は fixture の refs、{{capture.名前}} は前の手順で取り出した値に置き換わる。
 * 文字列全体が 1 つの {{キー}} なら、値の型（数値など）を保ったまま置き換わる
 */
export type Template = string;

export interface RequestTemplate {
  method: HttpMethod;
  path: Template;
  body?: JsonValue;
}

export type Condition =
  | { equals: JsonValue }
  | { notEquals: JsonValue }
  | { oneOf: JsonValue[] }
  | { contains: string }
  | { notContains: string }
  | { minLength: number }
  | { maxLength: number }
  | { exists: boolean };

/**
 * path は '.' 区切りで、'' は値全体を指す。'*' は配列の全要素を指し、全要素が条件を満たすことを求める
 * （空の配列は満たす）。contains・notContains は文字列以外の値を JSON にして比べる
 */
export interface Matcher {
  path: string;
  is: Condition;
}

export interface ResponseExpectation {
  status?: number | number[];
  body?: Matcher[];
}

export interface EventExpectation {
  type: string;
  where?: Matcher[];
  /** 既定は present。absent は条件に合う事象が 1 つもないことを求める */
  presence?: 'present' | 'absent';
}

export type Step =
  | {
      kind: 'request';
      as: ActorKey;
      request: RequestTemplate;
      expect?: ResponseExpectation;
      events?: EventExpectation[];
      /** 応答の path の値を {{capture.名前}} として後の手順で使う */
      capture?: Record<string, string>;
    }
  | { kind: 'render'; as: ActorKey; view: ViewTarget; events?: EventExpectation[] };

/** security のうち、パックの target に含まれないものは回帰テストとして扱う */
export type TestCategory = 'normal' | 'security';

export interface TestCase {
  id: string;
  category: TestCategory;
  title: string;
  steps: Step[];
}

/** プレイヤーの操作で観測した 1 回のやり取りが、攻撃の成立にあたるかを判定する条件 */
export interface ExchangeMatcher {
  actor?: { is?: ActorKey; not?: ActorKey };
  kind?: 'request' | 'render';
  /** path の '*' は 1 セグメントに一致する */
  request?: { method?: HttpMethod; path?: Template };
  response?: ResponseExpectation;
  events?: EventExpectation[];
}

/**
 * 攻撃の成立条件。steps は事前検証で自動実行し、すべての期待を満たせば成立とみなす。
 * detect はプレイヤー自身の操作の判定に使う（自動 probe では再現の達成印を付けない、spec A14）
 */
export interface ProbeDef {
  id: string;
  title: string;
  steps: Step[];
  detect: ExchangeMatcher;
}
