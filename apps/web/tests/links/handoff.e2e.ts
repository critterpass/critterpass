import { expect, test } from '@playwright/test';

const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const INSTAGRAM_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0';
const INSTAGRAM_ANDROID =
  'Mozilla/5.0 (Linux; Android 16; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0.0 Android';

const PRODUCTION_APP_STORE = 'https://apps.apple.com/app/id6816655856';

function playReferrer(href: string | null): string | null {
  return href === null ? null : new URL(href).searchParams.get('referrer');
}

test.describe('desktop', () => {
  test('shows the invite, the code large, a QR and store links with the Play referrer', async ({
    page,
  }) => {
    const response = await page.goto('/i/BAX6XA?c=wa');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Winston wants you in Bali');
    await expect(page.getByTestId('invite-code')).toHaveAttribute(
      'aria-label',
      'Invite code B A X 6 X A',
    );
    await expect(page.getByRole('img', { name: 'QR code for this link' })).toBeVisible();
    await expect(page.getByTestId('open-in-app')).toHaveAttribute(
      'href',
      'https://go.critterpass.app/i/BAX6XA',
    );
    await expect(page.getByTestId('app-store')).toHaveAttribute('href', PRODUCTION_APP_STORE);
    const play = await page.getByTestId('google-play').getAttribute('href');
    expect(new URL(play ?? '').searchParams.get('id')).toBe('app.critterpass');
    expect(playReferrer(play)).toBe('cp_link=%2Fi%2FBAX6XA');
    await expect(page.getByTestId('in-app-escape')).toHaveCount(0);
  });

  test('reads /j/ as the same invite and shows closed invites as closed', async ({ page }) => {
    await page.goto('/j/bax-6xa');
    await expect(page.getByTestId('invite-code')).toHaveAttribute(
      'aria-label',
      'Invite code B A X 6 X A',
    );
    await page.goto('/i/BAX6XC');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'This invite was switched off',
    );
  });

  test('answers an unknown code with 404 and a working code form', async ({ page }) => {
    const response = await page.goto('/i/ZZZZ2K');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("This link doesn't work");
    await page.getByLabel('Have a code?').fill('K7M2Q0');
    await page.getByRole('button', { name: 'Find my crew' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByLabel('Have a code?').fill('bax 6xa');
    await page.getByRole('button', { name: 'Find my crew' }).click();
    await expect(page).toHaveURL(/\/i\/BAX6XA$/);
  });

  test('renders a generic handoff for in-app routes', async ({ page }) => {
    expect((await page.goto('/app/trip/abc/day/2'))?.status()).toBe(200);
    await expect(page.getByTestId('open-in-app')).toHaveAttribute(
      'href',
      'https://go.critterpass.app/app/trip/abc/day/2',
    );
    expect((await page.goto('/plan/not-a-trip-id'))?.status()).toBe(404);
  });
});

test.describe('iPhone Safari', () => {
  test.use({ userAgent: SAFARI_IOS, viewport: { width: 390, height: 844 } });

  test('opens through the other host, offers the Smart App Banner and copies before the store', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/i/BAX6XA');
    await expect(page.getByTestId('open-in-app')).toHaveAttribute(
      'href',
      'https://go.critterpass.app/i/BAX6XA?open=1',
    );
    await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveAttribute(
      'content',
      'app-id=6816655856, app-argument=https://critterpass.app/i/BAX6XA',
    );
    await expect(page.locator('meta[name="app-clip-bundle-id"]')).toHaveCount(0);
    await page.route('https://apps.apple.com/**', (route) =>
      route.fulfill({ status: 200, body: 'store' }),
    );
    await page.getByTestId('app-store').click();
    await page.waitForURL(PRODUCTION_APP_STORE);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'https://critterpass.app/i/BAX6XA',
    );
  });

  test('sends an open tap that reached the web (app not installed) to the App Store', async ({
    request,
  }) => {
    const response = await request.get('/i/BAX6XA?open=1', {
      headers: { 'user-agent': SAFARI_IOS },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toBe(PRODUCTION_APP_STORE);
  });
});

test.describe('Android Chrome', () => {
  test.use({ userAgent: CHROME_ANDROID, viewport: { width: 390, height: 844 } });

  test('opens the app through an intent URL that falls back to Play with the referrer', async ({
    page,
  }) => {
    await page.goto('/i/BAX6XA');
    const href = (await page.getByTestId('open-in-app').getAttribute('href')) ?? '';
    expect(href.startsWith('intent://go.critterpass.app/i/BAX6XA#Intent;scheme=https;')).toBe(true);
    expect(href).toContain(';package=app.critterpass;');
    const fallback = decodeURIComponent(/S\.browser_fallback_url=([^;]+)/.exec(href)?.[1] ?? '');
    expect(playReferrer(fallback)).toBe('cp_link=%2Fi%2FBAX6XA');
  });
});

test.describe('in-app browsers', () => {
  test.describe('Instagram on iPhone', () => {
    test.use({ userAgent: INSTAGRAM_IOS, viewport: { width: 390, height: 844 } });

    test('shows the open-in-browser overlay with a copy button', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/i/BAX6XA');
      const overlay = page.getByTestId('in-app-escape');
      await expect(overlay).toBeVisible();
      await expect(overlay.getByRole('heading')).toHaveText('Open in Safari');
      await expect(overlay.getByTestId('open-in-chrome')).toHaveCount(0);
      await overlay.getByTestId('copy-link').click();
      await expect(overlay.getByTestId('copy-link')).toHaveAttribute('data-copied', 'true');
      await expect(overlay.getByText('Copied')).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        'https://critterpass.app/i/BAX6XA',
      );
      await overlay.getByRole('button', { name: 'Not now' }).click();
      await expect(overlay).toBeHidden();
    });
  });

  test.describe('Instagram on Android', () => {
    test.use({ userAgent: INSTAGRAM_ANDROID, viewport: { width: 390, height: 844 } });

    test('offers to reopen the page in Chrome', async ({ page }) => {
      await page.goto('/i/BAX6XA?c=ig');
      await expect(page.getByTestId('open-in-chrome')).toHaveAttribute(
        'href',
        'intent://127.0.0.1/i/BAX6XA?c=ig#Intent;scheme=https;package=com.android.chrome;end',
      );
    });
  });
});
