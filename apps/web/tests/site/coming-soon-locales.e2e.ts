import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { COMING_SOON_URL } from './playwright.config';

const VI_JOIN = 'VÀO DANH SÁCH CHỜ';
const EN_JOIN = 'JOIN THE WAITLIST';

/** A fresh visitor whose browser is set to `locale` (it sends the matching `Accept-Language`). */
async function visitor(browser: Browser, locale: string): Promise<BrowserContext> {
  return browser.newContext({ baseURL: COMING_SOON_URL, locale });
}

test.describe('coming-soon page languages', () => {
  test('a Vietnamese browser gets Vietnamese at / with no redirect', async ({ browser }) => {
    const context = await visitor(browser, 'vi-VN');
    const page = await context.newPage();
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/');
    expect(response?.headers()['content-language']).toBe('vi');
    expect(response?.headers()['vary']).toContain('Accept-Language');
    expect(response?.headers()['vary']).toContain('Cookie');
    expect(response?.headers()['cache-control']).toContain('private');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.locator('[data-cs="nav-cta"]')).toHaveText(VI_JOIN);
    await expect(page).toHaveTitle(/Đi chơi cả nhóm/u);
    await context.close();
  });

  test('the Accept-Language order and q-values decide', async ({ request }) => {
    const langOf = async (acceptLanguage: string): Promise<string | undefined> => {
      const response = await request.get(`${COMING_SOON_URL}/`, {
        headers: { 'Accept-Language': acceptLanguage },
      });
      return /<html lang="([^"]+)"/u.exec(await response.text())?.[1];
    };
    expect(await langOf('ja,en;q=0.8')).toBe('ja');
    expect(await langOf('en;q=0.4, ko;q=0.9')).toBe('ko');
    expect(await langOf('zh-TW,zh-CN;q=0.9,en;q=0.8')).toBe('zh-Hans');
    expect(await langOf('zh-HK,th;q=0.5')).toBe('th');
    expect(await langOf('de')).toBe('en');
  });

  test('a Japanese browser gets Japanese', async ({ browser }) => {
    const context = await visitor(browser, 'ja-JP');
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.locator('[data-cs="nav-cta"]')).toHaveText('ウェイトリストに登録');
    await context.close();
  });

  test('a language that is not shipped gets English', async ({ browser }) => {
    const context = await visitor(browser, 'de-DE');
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('[data-cs="nav-cta"]')).toHaveText(EN_JOIN);
    await context.close();
  });

  test('the remembered choice beats the browser language', async ({ browser }) => {
    const context = await visitor(browser, 'en-US');
    await context.addCookies([{ name: 'cp_locale', value: 'vi', url: COMING_SOON_URL }]);
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await context.close();
  });

  test('/vi is Vietnamese under an English browser and lists every language address', async ({
    browser,
  }) => {
    const context = await visitor(browser, 'en-US');
    const page = await context.newPage();
    const response = await page.goto('/vi');
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://critterpass.app/vi',
    );
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(11);
    await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute(
      'href',
      'https://critterpass.app/',
    );
    await expect(page.locator('link[hreflang="zh-Hans"]')).toHaveAttribute(
      'href',
      'https://critterpass.app/zh-Hans',
    );
    const setCookie = (await response?.headerValue('set-cookie')) ?? '';
    expect(setCookie).toContain('cp_locale=vi');
    expect(setCookie).toContain('Max-Age=31536000');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Secure');
    await context.close();
  });

  test('the switcher changes the language and the choice sticks', async ({ browser }) => {
    const context = await visitor(browser, 'en-US');
    const page = await context.newPage();
    await page.goto('/');
    const switcher = page.getByRole('navigation', { name: 'Language' });
    await expect(switcher.getByRole('link')).toHaveCount(10);
    await expect(switcher.locator('[aria-current="true"]')).toHaveText('English');

    await switcher.getByRole('link', { name: 'Tiếng Việt' }).click();
    await expect(page).toHaveURL(`${COMING_SOON_URL}/vi`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(
      page.getByRole('navigation', { name: 'Ngôn ngữ' }).locator('[aria-current="true"]'),
    ).toHaveText('Tiếng Việt');

    // Back at the plain front door, and on the referral door, the choice is still Vietnamese.
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await page.goto('/w/somefriend');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await context.close();
  });

  test('the form speaks the page language: a bad email, then a real join', async ({ browser }) => {
    const context = await visitor(browser, 'vi-VN');
    const page = await context.newPage();
    await page.goto('/');
    const note = page.locator('[data-cs="join-note"]');
    await page.locator('[data-cs="email-input"]').fill('not-an-email');
    await page.locator('[data-cs="join-submit"]').click();
    await expect(note).toHaveText('Email này trông chưa đúng lắm. Bạn kiểm tra lại giúp nhé?');
    await expect(note).toHaveAttribute('data-error', 'true');

    await page.locator('[data-cs="email-input"]').fill(`locale-${Date.now()}@example.com`);
    await page.locator('[data-cs="join-submit"]').click();
    await expect(page.locator('[data-cs="joined-panel"]')).toBeVisible();
    await expect(page.locator('[data-cs="ticket-title"]')).toHaveText('ĐÃ XÁC NHẬN · ĐỢT ĐẦU');
    await expect(page.locator('[data-cs="joined-line"]')).toHaveText(
      'TOKEK đang giữ chỗ cho bạn ở Bali.',
    );
    await expect(page.locator('[data-cs="nav-cta"]')).toHaveText(/^BẠN XẾP THỨ \d/u);
    await context.close();
  });

  test('a referral link keeps its handle when the language changes', async ({ browser }) => {
    const context = await visitor(browser, 'en-US');
    const page = await context.newPage();
    await page.goto('/w/somefriend');
    await page
      .getByRole('navigation', { name: 'Language' })
      .getByRole('link', { name: '日本語' })
      .click();
    await expect(page).toHaveURL(`${COMING_SOON_URL}/w/somefriend?lang=ja`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    const config = JSON.parse((await page.locator('#cs-config').textContent()) ?? '{}') as {
      referredBy?: string;
    };
    expect(config.referredBy).toBe('somefriend');
    await context.close();
  });

  test('language addresses never shadow the link routes, and unknown ones are not pages', async ({
    browser,
  }) => {
    const context = await visitor(browser, 'en-US');
    const page = await context.newPage();
    // `/id` is Indonesian; `/i` stays the invite-link route and `/privacy` its own page.
    await page.goto('/id');
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
    for (const path of ['/i', '/r', '/j']) {
      const response = await context.request.get(path, { maxRedirects: 0 });
      expect(await response.text(), path).not.toContain('id="cs-config"');
    }
    expect((await context.request.get('/de')).status()).toBe(404);
    expect((await context.request.get('/nope')).status()).toBe(404);
    const lower = await context.request.get('/zh-hans', { maxRedirects: 0 });
    expect(lower.status()).toBe(301);
    expect(lower.headers()['location']).toBe('/zh-Hans');
    await context.close();
  });
});

test('the full site keeps one front door: a language address leads back to /', async ({
  request,
}) => {
  const response = await request.get('/vi', { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers()['location']).toBe('/');
});
