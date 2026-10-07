/**
 * A critter's name and species stay hidden until someone finds it, so nothing the open web can
 * fetch may carry them: not the scripts, not the prerendered pages, not the place list. Scans the
 * publicly served folder of both builds this suite already made (the site and the coming-soon
 * site) against the catalogue itself; see ./hidden-critters.ts for what counts and who is public.
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

  test('a city names its local only when asked for that one city', async ({ request }) => {
    const places = await request.get(`${COMING_SOON_URL}/api/waitlist/places/en.json`);
    expect(leakIn('places/en.json', await places.text())).toBeNull();
    const picked = await request.get(`${COMING_SOON_URL}/api/waitlist/place/cp-003?lang=en`);
    expect(picked.status()).toBe(200);
    expect(await picked.json()).toMatchObject({ role: 'local', name: 'TRÂU', kind: 'cp-003' });
  });
});
