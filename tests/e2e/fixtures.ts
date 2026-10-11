import { test as base, expect } from '@playwright/test';

// すべてのE2Eテストで、localhost以外への通信を遮断し、発生したら失敗にする（spec §12, A19）
export const test = base.extend<{ externalRequests: string[] }>({
  externalRequests: [
    async ({ context, baseURL }, use) => {
      const origin = new URL(baseURL!).origin;
      const external: string[] = [];
      await context.route(
        (url) => url.origin !== origin && !['data:', 'blob:'].includes(url.protocol),
        (route) => {
          external.push(route.request().url());
          return route.abort('blockedbyclient');
        },
      );
      await use(external);
      expect(external, 'localhost以外への通信が発生した').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
