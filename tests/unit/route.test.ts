// 画面と URL の対応（課題へ直接入る URL の読み書き）
import { describe, expect, it } from 'vitest';
import { isRouteHash, parseRoute, routeHash, type Route } from '../../platform/ui/route';

describe('parseRoute', () => {
  it.each(['', '#', '#/'])('# 以降が「%s」なら課題一覧', (hash) => {
    expect(parseRoute(hash)).toEqual({ page: 'list' });
  });

  it('ページ内リンク（#main）は画面を指さないので課題一覧', () => {
    expect(isRouteHash('#main')).toBe(false);
    expect(parseRoute('#main')).toEqual({ page: 'list' });
  });

  it('#/records は記録ページ', () => {
    expect(parseRoute('#/records')).toEqual({ page: 'records' });
  });

  it('#/missions/<課題ID> はその課題', () => {
    expect(parseRoute('#/missions/stored-xss')).toEqual({ page: 'mission', missionId: 'stored-xss' });
  });

  it.each(['#/missions', '#/missions/', '#/missions/idor/extra', '#/unknown'])('読めない形「%s」は null', (hash) => {
    expect(parseRoute(hash)).toBeNull();
  });
});

describe('routeHash', () => {
  const routes: Route[] = [{ page: 'list' }, { page: 'records' }, { page: 'mission', missionId: 'idor' }];

  it('課題の URL は #/missions/<課題ID>', () => {
    expect(routeHash({ page: 'mission', missionId: 'idor' })).toBe('#/missions/idor');
  });

  it.each(routes)('作った URL を読むと元の画面に戻る（$page）', (route) => {
    expect(parseRoute(routeHash(route))).toEqual(route);
  });
});
