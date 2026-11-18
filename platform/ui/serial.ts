// 非同期の処理を 1 件ずつ順に実行し、待機中に新しい要求が来たら古い要求は飛ばして最後だけ実行する。同じ鍵の要求が実行中なら合流する

/** 直列化した関数。実行して結果を返すか、後続の要求に追い越されて飛ばされたら undefined を返す */
export type Serialized<T, R> = (arg: T) => Promise<R | undefined>;

/**
 * task を直列に実行する関数を返す。前の実行が終わってから次を始めるので処理が重ならず、
 * 待機中に後から呼ばれた分があれば古い呼び出しは task を実行せずに undefined で終わる（最後の要求だけが反映される）。
 * key を渡すと、同じ鍵の要求が実行中（かつ待機中の要求がない）ときは新たに実行せず、実行中の結果に合流する。
 * 鍵が null の要求は合流しない（状態を変えた直後の描き直しなど、実行中の結果で代用できないときに使う）。
 * 画面の表示要求のように、同時に重ねたくなく、かつ最新の要求だけを反映したい処理に使う。
 */
export function serialLatest<T, R = void>(task: (arg: T) => Promise<R>, key?: (arg: T) => string | null): Serialized<T, R> {
  let chain: Promise<unknown> = Promise.resolve();
  let request = 0;
  let waiting = 0;
  let running: { key: string | null; result: Promise<R | undefined> } | undefined;
  return (arg: T) => {
    const mineKey = key?.(arg) ?? null;
    // 実行中の要求と同じ鍵で、間に別の要求が待っていなければ、結果は同じになるので合流する
    if (running && mineKey !== null && running.key === mineKey && waiting === 0) return running.result;
    const mine = ++request;
    waiting++;
    const run: Promise<R | undefined> = chain.then(async () => {
      waiting--;
      if (mine !== request) return undefined;
      running = { key: mineKey, result: run };
      try {
        return await task(arg);
      } finally {
        running = undefined;
      }
    });
    chain = run.catch(() => undefined);
    return run;
  };
}
