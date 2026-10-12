// Host（RuntimeAdapter）と Worker・プレビュー iframe の間のメッセージ
import type {
  ActorKey,
  AppRequest,
  AppResponse,
  FixtureData,
  HookId,
  ImplementationId,
  ImplementationSelection,
  InvokeCall,
  InvokeResult,
  ObservedEvent,
  PrepareOptions,
  RuntimeErrorCode,
} from '../../platform/contract';

export type WorkerRequest =
  | { op: 'prepare'; options: PrepareOptions }
  | { op: 'invoke'; call: Exclude<InvokeCall, { kind: 'render' }> }
  | { op: 'setImplementation'; hook: HookId; implementation: ImplementationId }
  | { op: 'reset' };

export type WorkerResult = FixtureData | InvokeResult | null;

/** すべての往復に attemptId・runId を付け、応答が呼び出しと一致するかを Host で照合する */
export interface WorkerEnvelope {
  callId: number;
  attemptId: string;
  runId: string;
  request: WorkerRequest;
}

export type WorkerReply =
  | { callId: number; attemptId: string; runId: string; ok: true; result: WorkerResult }
  | { callId: number; attemptId: string; runId: string; ok: false; error: { code: RuntimeErrorCode; message: string } };

/** Host → プレビュー */
export type ToFrame =
  | { type: 'render'; runId: string; appId: string; route: string; viewer: ActorKey; implementations: ImplementationSelection }
  | { type: 'response'; runId: string; requestId: number; response: AppResponse };

/** プレビュー → Host。ready 以外は現在の runId を付ける */
export type FromFrame =
  | { type: 'ready' }
  | { type: 'request'; runId: string; requestId: number; request: AppRequest }
  | { type: 'event'; runId: string; event: ObservedEvent }
  | { type: 'rendered'; runId: string; route: string }
  | { type: 'error'; runId: string; message: string };
