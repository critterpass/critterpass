/**
 * critterpass.app analytics store nothing on the device: after a page view and a CTA click there
 * is no cookie and nothing in localStorage or sessionStorage, and the events that were sent are
 * anonymous. PostHog is intercepted at the network boundary. Needs a build with
 * `PUBLIC_POSTHOG_KEY` set (any value), e.g. `PUBLIC_POSTHOG_KEY=phc_e2e pnpm test:e2e`.
 */
import { expect, test } from '@playwright/test';

test('page views and CTA clicks leave no cookie or storage behind', async ({ page, context }) => {
  const events: { event: string; distinct_id: string; properties: Record<string, unknown> }[] = [];
  await page.route('https://eu.i.posthog.com/**', async (route) => {
    const body = route.request().postData();
    if (body) events.push(JSON.parse(body) as (typeof events)[number]);
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
  });

  await page.goto('/');
  await page.locator('[data-cs="nav-cta"]').first().click();
  await expect.poll(() => events.map((event) => event.event)).toEqual(['$pageview', 'cta_clicked']);

  expect(await context.cookies()).toEqual([]);
  const storage = await page.evaluate(() => ({
    local: window.localStorage.length,
    session: window.sessionStorage.length,
  }));
  expect(storage).toEqual({ local: 0, session: 0 });
  for (const event of events) {
    expect(event.distinct_id).toMatch(/^web_/u);
    expect(event.properties['$process_person_profile']).toBe(false);
  }
});
