// 画面と URL の対応。課題へ直接入る URL（#/missions/<課題ID>）を読み書きする。静的な配布物なので、サーバーに届かない # より後ろだけを使う

/** URL で指せる画面。mission は課題の開始前チェックから入る */
export type Route = { page: 'list' } | { page: 'records' } | { page: 'mission'; missionId: string };

const MISSION = /^#\/missions\/([^/]+)$/;

/** # 以降が画面を指しているか。「本文へ移動」（#main）のようなページ内リンクは画面を指さない */
export const isRouteHash = (hash: string): boolean => hash.startsWith('#/');

/** location.hash を画面に読み替える。画面を指していない URL は課題一覧。画面を指しているのに読めない形は null（呼び出し側が利用者に知らせる） */
export function parseRoute(hash: string): Route | null {
  if (!isRouteHash(hash) || hash === '#/') return { page: 'list' };
  if (hash === '#/records') return { page: 'records' };
  const missionId = MISSION.exec(hash)?.[1];
  return missionId ? { page: 'mission', missionId } : null;
}

/** 画面を指す URL の # 以降。課題 ID は小文字・数字・ハイフンだけ（契約）なので、そのまま載せる */
export function routeHash(route: Route): string {
  if (route.page === 'mission') return `#/missions/${route.missionId}`;
  return route.page === 'records' ? '#/records' : '#/';
}
