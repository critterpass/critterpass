import { readFileSync } from 'node:fs';

import { storeListings } from '@cp/content/store';
import { describe, expect, it } from 'vitest';

import { customProductPages, inAppEvents } from './app-store-payloads';
import { easMetadata } from './metadata';
import { playListings } from './play-listing';

const listings = storeListings();

describe('store kit', () => {
  it('keeps apps/mobile/store.config.json in step with the listings', () => {
    const committed = JSON.parse(
      readFileSync(new URL('../../../apps/mobile/store.config.json', import.meta.url), 'utf8'),
    ) as unknown;
    expect(committed).toEqual(easMetadata(listings, 2026));
  });

  it('maps each listing language to the store locale codes', () => {
    expect(Object.keys(easMetadata(listings, 2026).apple.info)).toEqual(['en-US', 'vi']);
    expect(playListings(listings).map((l) => l.language)).toEqual(['en-US', 'vi']);
  });

  it('builds a Custom Product Page per listed page and an event per card', () => {
    const pages = customProductPages(listings, '123');
    expect(pages.map((p) => p.page.attributes.name)).toEqual([
      'Crew trip planning',
      'Critters to collect',
    ]);
    const [event] = inAppEvents(listings, '123');
    expect(event?.event.attributes.badge).toBe('SPECIAL_EVENT');
    expect(event?.localizations[0]?.attributes.locale).toBe('en-US');
  });
});
