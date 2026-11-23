// 演習画面の利用者として、ブラウザ内の呼び出しを実行環境へ送る。利用者ごとのセッションを持ち、基盤エラーは画面に出す理由へ変える
import { RuntimeError, type ActorKey, type AppRequest, type Exchange, type RuntimeAdapter, type SessionToken } from '../contract';

export class RequestSender {
  /** 利用者ごとのセッション。演習を始めるたびに発行し直す */
  private readonly sessions = new Map<ActorKey, SessionToken | null>();

  constructor(private readonly exercise: Pick<RuntimeAdapter, 'invoke'>) {}

  /** 発行済みのセッションを捨てる（演習の開始・初期化のとき） */
  clear(): void {
    this.sessions.clear();
  }

  /** 基盤エラーは failure に理由を返し、不合格には数えない */
  async invoke(actor: ActorKey, request: AppRequest, runId: string): Promise<{ exchange: Exchange } | { failure: string }> {
    try {
      const session = await this.sessionFor(actor, runId);
      const { response, events } = await this.exercise.invoke({ kind: 'request', session, request }, { runId });
      return { exchange: { runId, actor, kind: 'request', request, response, events } };
    } catch (error) {
      if (error instanceof RuntimeError && error.code === 'input-too-large') return { failure: '入力が大きすぎます（1 件 4KB まで）。短くしてください。' };
      if (error instanceof RuntimeError) return { failure: `システムのエラーで送れませんでした（不合格には数えません）：${error.message}` };
      throw error;
    }
  }

  private async sessionFor(actor: ActorKey, runId: string): Promise<SessionToken | null> {
    const known = this.sessions.get(actor);
    if (known !== undefined) return known;
    const session = (await this.exercise.invoke({ kind: 'session', actor }, { runId })).session ?? null;
    this.sessions.set(actor, session);
    return session;
  }
}
