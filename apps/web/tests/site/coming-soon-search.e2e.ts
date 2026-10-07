import { expect, test, type Browser, type Page } from '@playwright/test';

import { COMING_SOON_URL } from './playwright.config';

async function open(browser: Browser, locale: string, path = '/'): Promise<Page> {
  const context = await browser.newContext({ baseURL: COMING_SOON_URL, locale });
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

const cs = (page: Page, name: string) => page.locator(`[data-cs="${name}"]`);

test.describe('destination search on the waitlist form', () => {
  test('the place list loads only when the field is first used', async ({ browser }) => {
    const page = await open(browser, 'en-US');
    const requests: string[] = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await page.waitForTimeout(500);
    expect(requests.filter((path) => path.includes('/places/'))).toEqual([]);
    const loaded = page.waitForResponse((response) => response.url().includes('/places/en.json'));
    await page.getByRole('combobox', { name: 'Somewhere else?' }).focus();
    expect((await loaded).status()).toBe(200);
    await page.context().close();
  });

  test('"da nang" finds Đà Nẵng; picking it shows on the pass, and joining keeps it', async ({
    browser,
  }) => {
    const page = await open(browser, 'en-US');
    const ticket = page.locator('.cs-ticket__card');
    const heightBefore = (await ticket.boundingBox())?.height;

    const search = page.getByRole('combobox', { name: 'Somewhere else?' });
    await search.fill('da nang');
    const option = page.getByRole('option').first();
    await expect(option).toContainText('Đà Nẵng');
    await expect(option).toContainText('Chà Vá');
    await option.click();

    const picked = cs(page, 'place-picked');
    await expect(picked).toBeVisible();
    await expect(picked).toContainText('ĐÀ NẴNG');
    await expect(picked).toHaveAccessibleName('Remove Đà Nẵng');
    await expect(search).toBeHidden();
    await expect(page.locator('[data-cs="chip"][aria-pressed="true"]')).toHaveCount(0);
    await expect(cs(page, 'pass-city')).toHaveText('ĐÀ NẴNG');
    await expect(cs(page, 'pass-guide-name')).toHaveText('CHÀ VÁ');
    // Same slot, same height: the ticket does not jump.
    expect((await ticket.boundingBox())?.height).toBeCloseTo(heightBefore ?? 0, 1);

    await cs(page, 'email-input').fill(`search-${Date.now()}@example.com`);
    await cs(page, 'join-submit').click();
    await expect(cs(page, 'joined-panel')).toBeVisible();
    await expect(cs(page, 'joined-line')).toHaveText("CHÀ VÁ's saving you a seat in Đà Nẵng.");
    await expect(cs(page, 'pass-city')).toHaveText('ĐÀ NẴNG');

    // A returning visitor gets the same place back from the stored key.
    await page.reload();
    await expect(cs(page, 'joined-panel')).toBeVisible();
    await expect(cs(page, 'joined-line')).toHaveText("CHÀ VÁ's saving you a seat in Đà Nẵng.");
    await expect(cs(page, 'pass-city')).toHaveText('ĐÀ NẴNG');
    await page.context().close();
  });

  test('a catalogue city shows its local, an airport city Tokek as guest', async ({ browser }) => {
    const page = await open(browser, 'en-US');
    const search = page.getByRole('combobox', { name: 'Somewhere else?' });
    await search.fill('hoi an');
    await page.getByRole('option', { name: /Hội An/u }).click();
    await expect(cs(page, 'pass-city')).toHaveText('HỘI AN');
    await expect(cs(page, 'pass-guide-name')).toHaveText('CHÉP');
    await expect(cs(page, 'pass-guide-label')).toHaveText('your local');

    // Clearing the pick brings back the field and the first chip.
    await cs(page, 'place-picked').click();
    await expect(search).toBeFocused();
    await expect(page.locator('[data-cs="chip"][aria-pressed="true"]')).toHaveText(/BALI/u);

    await search.fill('zanzibar');
    await page.getByRole('option', { name: /Zanzibar/u }).click();
    await expect(cs(page, 'pass-city')).toHaveText('ZANZIBAR');
    await expect(cs(page, 'pass-guide-name')).toHaveText('TOKEK');
    await expect(cs(page, 'pass-guide-label')).toHaveText('your guide');
    await page.context().close();
  });

  test('works from the keyboard, and a chip city selects its chip', async ({ browser }) => {
    const page = await open(browser, 'en-US');
    const search = page.getByRole('combobox', { name: 'Somewhere else?' });
    await search.fill('kyo');
    await expect(search).toHaveAttribute('aria-expanded', 'true');
    await search.press('ArrowDown');
    await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
    await expect(search).toHaveAttribute('aria-activedescendant', 'cs-place-option-0');
    await search.press('Enter');
    await expect(page.locator('[data-cs="chip"][aria-pressed="true"]')).toHaveText(/KYOTO/u);
    await expect(cs(page, 'place-picked')).toBeHidden();
    await expect(search).toHaveValue('');
    await expect(cs(page, 'join-form')).toBeVisible();

    await search.fill('lis');
    await search.press('Escape');
    await expect(search).toHaveAttribute('aria-expanded', 'false');
    await page.context().close();
  });

  test('typed text that is not a place cannot be submitted', async ({ browser }) => {
    const page = await open(browser, 'en-US');
    const joins: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/waitlist/join')) joins.push(request.url());
    });
    const search = page.getByRole('combobox', { name: 'Somewhere else?' });
    await search.fill('zzzz');
    await expect(cs(page, 'place-status')).toHaveText(
      'No place by that name. Try another spelling.',
    );
    await expect(page.getByRole('option')).toHaveCount(0);
    await cs(page, 'email-input').fill('someone@example.com');
    await cs(page, 'join-submit').click();
    await expect(cs(page, 'join-note')).toHaveText(
      'Pick a place from the list, or clear the search.',
    );
    await expect(cs(page, 'joined-panel')).toBeHidden();
    expect(joins).toEqual([]);
    await page.context().close();
  });

  test('a translated page names places its own way and finds them by either name', async ({
    browser,
  }) => {
    const page = await open(browser, 'ja-JP');
    await expect(page.locator('[data-cs="chip"]').nth(1)).toContainText('京都');
    await expect(cs(page, 'pass-city')).toHaveText('バリ島');
    const search = page.getByRole('combobox', { name: 'ほかの場所は？' });
    await search.fill('ホイアン');
    await expect(page.getByRole('option').first()).toContainText('ホイアン');
    await search.fill('hoi an');
    await page.getByRole('option').first().click();
    await expect(cs(page, 'pass-city')).toHaveText('ホイアン');
    await expect(cs(page, 'pass-guide-label')).toHaveText('あなたの仲間');
    await page.context().close();
  });

  test('the server accepts only listed places and names them itself', async ({ request }) => {
    const join = (destination: string, extra: Record<string, unknown> = {}) =>
      request.post(`${COMING_SOON_URL}/api/waitlist/join`, {
        data: { email: `api-${Date.now()}@example.com`, destination, company: '', ...extra },
      });
    expect((await join('atlantis')).status()).toBe(400);
    expect((await join('Đà Nẵng')).status()).toBe(400);
    expect((await join('<img src=x>')).status()).toBe(400);
    expect((await request.get(`${COMING_SOON_URL}/api/waitlist/place/atlantis`)).status()).toBe(
      404,
    );

    const places = (await (
      await request.get(`${COMING_SOON_URL}/api/waitlist/places/en.json`)
    ).json()) as [string, string][];
    const zanzibar = places.find((row) => row[1] === 'Zanzibar');
    const accepted = await join(zanzibar?.[0] ?? '', { place: { city: 'HACKED' }, locale: 'vi' });
    expect(accepted.status()).toBe(201);
    const body = (await accepted.json()) as { destination: string; place: { city: string } };
    expect(body.destination).toBe(zanzibar?.[0]);
    expect(body.place.city).toBe('ZANZIBAR');
  });
});
