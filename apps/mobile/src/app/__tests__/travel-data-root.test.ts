/**
 * The travel-data hooks (weather, fares, hazards, crowds, destination insights) only reach the api
 * through the reader the app root provides; without it they read an empty cache for ever and every
 * screen shows "no data". The root layout cannot render in Jest (native session, database), so this
 * reads its source: the provider wraps the navigator and is given a reader built with the device's
 * session headers.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const layout = readFileSync(join(__dirname, '..', '_layout.tsx'), 'utf8');

describe('travel data at the app root', () => {
  it('builds the reader with the device session', () => {
    expect(layout).toMatch(/createTravelDataReader\(\{\s*sessionHeaders\s*\}\)/u);
  });

  it('provides it above the navigator', () => {
    const provider = layout.indexOf('<TravelDataReaderProvider value={travelData}>');
    const navigator = layout.indexOf('<RootNavigator />');
    const close = layout.indexOf('</TravelDataReaderProvider>');
    expect(provider).toBeGreaterThan(-1);
    expect(navigator).toBeGreaterThan(provider);
    expect(close).toBeGreaterThan(navigator);
  });
});
