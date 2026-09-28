import { expect, test } from '@playwright/test';

import { API_PORT } from './playwright.config';

test.describe('OG cards', () => {
  test('an invite card is drawn once, cached, and gone once the code is switched off', async ({
    request,
  }) => {
    const first = await request.get('/og/invite/VANE55.png');
    expect(first.status()).toBe(200);
    expect(first.headers()['content-type']).toBe('image/png');
    expect(first.headers()['cache-control']).toBe('no-store');
    expect((await first.body()).byteLength).toBeLessThan(300 * 1024);
    const second = await request.get('/og/invite/VANE55.png');
    expect(second.headers()['x-og-cache']).toBe('hit');

    await request.post(`http://127.0.0.1:${API_PORT}/__revoke/VANE55`);
    expect((await request.get('/og/invite/VANE55.png')).status()).toBe(404);
  });

  test('a referral card renders; ids that are not codes never do', async ({ request }) => {
    expect((await request.get('/og/referral/WYNST8.png')).status()).toBe(200);
    expect(
      (await request.get('/og/invite/0190a6f1-7aaa-7bbb-8ccc-123456789abc.png')).status(),
    ).toBe(404);
    expect((await request.get('/og/invite/EXPR22.png')).status()).toBe(404);
    expect((await request.get('/og/crew/SANDY4.png')).status()).toBe(404);
  });
});
