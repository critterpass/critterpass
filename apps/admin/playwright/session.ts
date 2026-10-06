import { expect, test, type Page } from '@playwright/test';

/**
 * Signs in through the local dev door as one of the seeded operators and waits for Home. The auth
 * limiter (30 sign-ins per IP per minute) is real, and a fast run signs in more often than that, so
 * a 429 waits out the limiter's `X-Retry-After` and signs in again.
 */
export async function signInAs(page: Page, role: 'owner' | 'ops' | 'content' | 'support') {
  await page.goto('/sign-in');
  await page.getByLabel('Local operator e-mail').fill(`${role}@critterpass.test`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' && candidate.url().endsWith('/dev/sign-in'),
    );
    await page.getByRole('button', { name: 'Sign in locally' }).click();
    const answer = await response;
    if (answer.status() !== 429) break;
    const waitMs = (Number(answer.headers()['x-retry-after'] ?? '60') + 1) * 1000;
    test.info().setTimeout(test.info().timeout + waitMs);
    await page.waitForTimeout(waitMs);
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /^Good (morning|afternoon|evening), /,
  );
}

export function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Console' });
}
