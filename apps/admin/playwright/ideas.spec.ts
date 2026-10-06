import { expect, test } from '@playwright/test';

import { nav, signInAs } from './session';

test('support publishes a suggested idea with a team note, then marks it planned', async ({
  page,
}) => {
  await signInAs(page, 'support');
  await nav(page).getByRole('link', { name: 'Feedback & ideas' }).click();
  const ideas = page.getByRole('list', { name: 'Ideas' });
  const idea = ideas.getByRole('listitem', { name: 'Split a bill by item, not evenly' });
  await idea.getByLabel('Team note (shown on the board)').fill('Good one. Looking at it.');
  await idea.getByRole('button', { name: 'Publish' }).click();
  await expect(idea).toHaveCount(0);

  await page.getByRole('tab', { name: /Open/ }).click();
  const published = ideas.getByRole('listitem', { name: 'Split a bill by item, not evenly' });
  await expect(published.getByLabel('Team note (shown on the board)')).toHaveValue(
    'Good one. Looking at it.',
  );
  await published.getByRole('button', { name: 'Planned' }).click();
  await expect(published).toHaveCount(0);
  await page.getByRole('tab', { name: /planned/i }).click();
  await expect(ideas.getByRole('listitem')).toHaveCount(1);
});

test('ops cannot open the ideas list', async ({ page }) => {
  await signInAs(page, 'ops');
  await expect(nav(page).getByRole('link', { name: 'Feedback & ideas' })).toHaveCount(0);
  await page.goto('/ideas');
  await expect(page.getByText('Not for your role')).toBeVisible();
});
