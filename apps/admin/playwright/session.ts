import { expect, type Page } from '@playwright/test';

/** Signs in through the local dev door as one of the seeded operators and waits for Home. */
export async function signInAs(page: Page, role: 'owner' | 'ops' | 'content' | 'support') {
  await page.goto('/sign-in');
  await page.getByLabel('Local operator e-mail').fill(`${role}@critterpass.test`);
  await page.getByRole('button', { name: 'Sign in locally' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Hi,');
}

export function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Console' });
}
