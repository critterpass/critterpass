import { expect, test } from '@playwright/test';

import { API_PORT } from './playwright.config';

test.describe('invite landing', () => {
  test('a trip invite shows the crew, the trip and a ticking expiry, never cached', async ({
    page,
  }) => {
    const response = await page.goto('/i/SANDY4');
    expect(response?.status()).toBe(200);
    expect(response?.headers()['cache-control']).toBe('private, no-store');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Winston wants you in Bali');
    const ticket = page.getByTestId('handoff-ticket');
    await expect(
      ticket.getByRole('list', { name: 'Already in: Maya, Arjun, Jess, Rafa' }),
    ).toBeVisible();
    await expect(ticket).toContainText('4 already in');
    await expect(ticket).toContainText('~$1,240 each');
    await expect(ticket).toContainText('The Bali Six');
    const draft = page.getByTestId('invite-draft');
    await expect(draft.getByRole('heading')).toHaveText("Tokek's draft · 3 of 8 days");
    await expect(draft.getByRole('listitem')).toHaveCount(3);
    await expect(draft).toContainText('Batur sunrise hike');
    const expires = page.getByTestId('invite-expires');
    const first = await expires.textContent();
    expect(first).toMatch(/^Expires in \d+d \d\d:\d\d:\d\d$/u);
    await expect(expires).not.toHaveText(first ?? '');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://critterpass.app/og/invite/SANDY4.png',
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.getByTestId('site-header')).toBeVisible();
  });

  test('expired, full and switched-off invites each say so', async ({ page }) => {
    await page.goto('/i/EXPR22');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This invite has run out');
    await expect(page.getByTestId('invite-expires')).toHaveCount(0);
    await expect(page.getByTestId('invite-draft')).toHaveCount(0);
    await page.goto('/i/FAWN33');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every seat is taken');
    await page.goto('/i/BAX6XC');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'This invite was switched off',
    );
  });

  test('an invite switched off after a first view shows as switched off on the next', async ({
    page,
    request,
  }) => {
    await page.goto('/i/FRAP44');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Winston wants you in Bali');
    await request.post(`http://127.0.0.1:${API_PORT}/__revoke/FRAP44`);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'This invite was switched off',
    );
  });

  test('an unknown code answers 404 with the code form', async ({ page }) => {
    const response = await page.goto('/j/QQQQ22');
    expect(response?.status()).toBe(404);
    await expect(page.getByLabel('Have a code?')).toBeVisible();
  });

  test('/j without a code is the join-with-a-code page', async ({ page }) => {
    const response = await page.goto('/j');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join with a code');
    await page.getByLabel('Have a code?').fill('sandy 4');
    await page.getByRole('button', { name: 'Find my crew' }).click();
    await expect(page).toHaveURL(/\/i\/SANDY4$/u);
  });

  test('on a phone there is no QR code', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();
    await page.goto('/i/SANDY4');
    await expect(page.getByRole('img', { name: 'QR code for this link' })).toHaveCount(0);
    await expect(page.getByTestId('open-in-app')).toBeVisible();
    await context.close();
  });
});

test.describe('referral landing', () => {
  test("a friend's referral link speaks for them and offers their link", async ({ page }) => {
    const response = await page.goto('/r/WYNST8');
    expect(response?.status()).toBe(200);
    expect(response?.headers()['cache-control']).toBe('private, no-store');
    const card = page.getByTestId('referral-card');
    await expect(card).toContainText('Winston invited you');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Trips are better with tagalongs',
    );
    await expect(page.getByTestId('referral-link')).toHaveText('critterpass.app/r/WYNST8');
    await expect(page.getByRole('link', { name: 'Referral terms' })).toHaveAttribute(
      'href',
      '/legal/referral-terms',
    );
  });

  test('/r is the bring-your-crew page, marked in the header', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const response = await page.goto('/r');
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('referral-link')).toHaveCount(0);
    await expect(page.getByText('You → Invite friends')).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Bring your crew' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});
