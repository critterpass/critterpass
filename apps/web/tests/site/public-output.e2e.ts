/**
 * A critter's name and species stay hidden until someone finds it, so nothing the open web can
 * fetch as a file may carry them: not the scripts, not the prerendered pages. Scans the
 * publicly served folder of both builds this suite already made (the site and the coming-soon
 * site) against the catalogue itself; see ./hidden-critters.ts for what counts and who is public.
 * The waitlist's place search is the one answer that may name a local: the local of a city it
 * found for what a visitor typed, a few rows at a time.
 */
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { hiddenCritters, hiddenNamesIn, leakIn, leaksUnder } from './hidden-critters';
import { COMING_SOON_URL } from './playwright.config';

const webRoot = fileURLToPath(new URL('../..', import.meta.url));
const PUBLIC_FOLDERS = [
  `${webRoot}dist/client`,
  `${webRoot}.wrangler/coming-soon-e2e/site/client`,
] as const;

test.describe('what the open web can fetch', () => {
  test('the scan knows a leak when it sees one', () => {
    expect(hiddenCritters().length).toBeGreaterThan(100);
    const row = '{"id":"cp-003","name":"Trâu","species":"Water buffalo"}';
    expect(leakIn('dex.js', row)).toMatchObject({ identified: ['Trâu'] });
    expect(leakIn('pass.html', '<b>TRÂU</b> <i>WATER BUFFALO</i>')?.identified).toEqual(['Trâu']);
    expect(leakIn('names.json', '["Rồng","Trâu","Sao La","Cò","Xoáy"]')?.listed).toHaveLength(5);
    // An ordinary word, a city far from any catalogue key, a public guide and a preview local
    // are not leaks.
    const cities = `["cp-078","Algarve","PT",0,""]${' '.repeat(400)}["apt-fao","Faro","PT",2]`;
    expect(leakIn('places.json', cities)).toBeNull();
    expect(
      leakIn('tip.html', 'Find Kiwi fruit, then ask Tokek. Chép is a Lantern carp.'),
    ).toBeNull();
  });

  for (const folder of PUBLIC_FOLDERS) {
    test(`no served file names a hidden critter: ${folder.slice(webRoot.length)}`, async () => {
      expect(await leaksUnder(folder)).toEqual([]);
    });
  }

  test('the locals page names no critter in its HTML', async ({ request }) => {
    const response = await request.get('/locals/jp-kyoto');
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('3 critters to find here');
    expect(hiddenNamesIn(html)).toEqual([]);
    expect(leakIn('/locals/jp-kyoto', html)).toBeNull();
  });

  test('a search names the locals of the few cities it finds, and never lists', async ({
    request,
  }) => {
    const search = (query: string) =>
      request.get(`${COMING_SOON_URL}/api/waitlist/search?q=${encodeURIComponent(query)}&lang=en`);
    const found = await search('sa pa');
    expect(found.status()).toBe(200);
    expect(((await found.json()) as unknown[][])[0]?.slice(0, 6)).toEqual([
      'cp-003',
      'Sa Pa',
      'VN',
      0,
      'Trâu',
      'Water buffalo',
    ]);
    // A critter's name finds its city too.
    expect(((await (await search('trau')).json()) as unknown[][])[0]?.[0]).toBe('cp-003');
    for (const query of ['an', 'ch', 'cp-', 'the']) {
      const rows = (await (await search(query)).json()) as unknown[];
      expect(rows.length, query).toBeLessThanOrEqual(8);
    }
    for (const query of ['', ' ', 'a', '*', 'x'.repeat(65)]) {
      expect((await search(query)).status(), JSON.stringify(query)).toBe(400);
    }
    expect((await request.get(`${COMING_SOON_URL}/api/waitlist/search`)).status()).toBe(400);
    // The whole list is no longer a file anyone can fetch.
    const list = await request.get(`${COMING_SOON_URL}/api/waitlist/places/en.json`);
    expect(list.status()).toBe(404);
  });

  // Not served, so not a failure: the Worker names a trip's guide and a searched city's local
  // from the catalogue. Reported so a change in how much it carries is seen.
  test('the Worker bundle is reported, not judged', async () => {
    const leaks = await leaksUnder(`${webRoot}dist/server`);
    const named = new Set(leaks.flatMap((leak) => [...leak.identified, ...leak.listed]));
    const summary = `${leaks.length} Worker files name ${named.size} hidden critters`;
    test.info().annotations.push({ type: 'worker-bundle', description: summary });
    console.log(`[public-output] ${summary}: ${leaks.map((leak) => leak.file).join(', ')}`);
  });
});
