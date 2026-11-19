// テスト用の進捗 JSON（書き出しファイルの形）
import { PROGRESS_FORMAT, PROGRESS_SCHEMA_VERSION } from '../../platform/progress/schema';

/** 型が不正な項目も渡せる進捗 JSON。既定は現在の版で、記録なし。profile: undefined で旧版と同じく項目を省ける。 */
export function progressJson(options: {
  format?: string;
  schemaVersion?: unknown;
  exportedAt?: string;
  attempts?: unknown[];
  profile?: unknown;
} = {}): string {
  return JSON.stringify({
    format: PROGRESS_FORMAT,
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    exportedAt: '',
    attempts: [],
    profile: {},
    ...options,
  });
}
