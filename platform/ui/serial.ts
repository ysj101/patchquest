// 非同期の処理を 1 件ずつ順に実行し、待機中に新しい要求が来たら古い要求は飛ばして最後だけ実行する

/**
 * task を直列に実行する関数を返す。前の実行が終わってから次を始めるので処理が重ならず、
 * 待機中に後から呼ばれた分があれば古い呼び出しは task を実行せずに終わる（最後の要求だけが反映される）。
 * 画面の表示要求のように、同時に重ねたくなく、かつ最新の要求だけを反映したい処理に使う。
 */
export function serialLatest<T>(task: (arg: T) => Promise<void>): (arg: T) => Promise<void> {
  let chain: Promise<void> = Promise.resolve();
  let request = 0;
  return (arg: T) => {
    const mine = ++request;
    const run = chain.then(() => (mine === request ? task(arg) : undefined));
    chain = run.catch(() => undefined);
    return run;
  };
}
