// 検証ページの共通処理。例外も含めて結果を返し、RuntimeError の code を E2E から確かめられるようにする
export type Settled<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

export async function settle<T>(work: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await work };
  } catch (e) {
    return { ok: false, code: (e as { code?: string }).code ?? 'unknown', message: e instanceof Error ? e.message : String(e) };
  }
}
