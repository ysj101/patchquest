// 擬似シェルが記録する観測イベントと、やり取りの短い表示（調査パネルと「加えた変更」で使う）。計測した値だけを示す
import type { AppRequest, JsonValue, ObservedEvent } from '../../platform/contract';

/** 計測した値を、そのまま文字にする */
const shown = (value: JsonValue | undefined): string => (typeof value === 'string' ? value : JSON.stringify(value ?? null));

export function describeEvent(event: ObservedEvent): string | null {
  const data = event.data;
  switch (event.type) {
    case 'sudo.decision':
      return `sudo の判断：${data.decision === 'allow' ? '許可' : '拒否'}（${shown(data.reason)}）・利用者 ${shown(data.user)}・コマンド ${shown(data.command)}・実行する利用者 ${shown(data.runAs)}`;
    case 'shell.exec':
      return `プログラムの実行：${shown(data.program)}・利用者 ${shown(data.user)}・実行した権限 ${shown(data.runAs)}`;
    case 'file.changed':
      return `ファイルの変更：${shown(data.path)} の ${shown(data.line)} 行目・利用者 ${shown(data.user)}・実行した権限 ${shown(data.runAs)}`;
    default:
      return null;
  }
}

/** コマンド行のやり取りは、端末に打った形（$ コマンド行）で示す。それ以外は説明しない */
export function describeRequest(request: AppRequest): string | null {
  const body = request.body;
  if (request.method !== 'POST' || request.path !== '/sh' || typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  return typeof body.line === 'string' ? `$ ${body.line}` : null;
}
