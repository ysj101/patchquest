import type { AppResponse, JsonValue } from '../../platform/contract';

export function json(status: number, body: JsonValue): AppResponse {
  return { status, body };
}
