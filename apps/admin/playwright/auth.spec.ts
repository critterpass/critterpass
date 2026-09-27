import { expect, test } from '@playwright/test';

import { nav, signInAs } from './session';

test('an unauthenticated visit lands on sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});

test('support sees only what support may open', async ({ page }) => {
  await signInAs(page, 'support');
  const links = nav(page).getByRole('link');
  await expect(links.first()).toHaveText('Home');
  for (const hidden of ['Catalogue', 'Flags & config', 'Partners']) {
    await expect(nav(page).getByRole('link', { name: hidden })).toHaveCount(0);
  }
  await expect(nav(page)).toContainText('support@critterpass.test');
});

test('signing out returns to sign-in', async ({ page }) => {
  await signInAs(page, 'content');
  await nav(page).getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
});
