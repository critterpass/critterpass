/**
 * Help search on full text and trigram alone (no embedding vendor): a refund question ranks the
 * billing article first, a typo still finds its article, the place help was opened from lifts its
 * category, a locale without articles falls back to English, and the hub's list follows context.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AccountHarness, Session } from '../account/account-harness';
import { startHelpHarness } from './help-harness';

let h: AccountHarness;
let me: Session;

const ARTICLES = [
  {
    slug: 'pass-plus-refunds',
    category: 'refunds',
    title: 'Pass+ and Trip Boost refunds',
    summary: 'How refunds for Pass+ and Trip Boosts work through the App Store and Google Play.',
    body: 'Purchases are billed by the store. Ask the store for a refund; restore on a new phone.',
  },
  {
    slug: 'change-booking',
    category: 'bookings',
    title: 'Changing a booking',
    summary: 'Change dates or guests with the partner you booked with.',
    body: 'The partner decides any refund. CritterPass never holds money for a booking.',
  },
  {
    slug: 'offline-maps',
    category: 'offline_and_maps',
    title: 'Using maps offline',
    summary: 'Download your trip pack so maps work without signal.',
    body: 'Open the trip and save the pack before you fly.',
  },
  {
    slug: 'split-trip-boost',
    category: 'splitting_money',
    title: 'Splitting the cost of a Trip Boost',
    summary: 'Share a boost with your crew.',
    body: 'Each person pays their part in the store.',
  },
  {
    slug: 'trip-boost',
    category: 'passes_and_boosts',
    title: 'What is a Trip Boost?',
    summary: 'A boost unlocks more for one trip.',
    body: 'Buy a boost for a trip and the whole crew gets it.',
  },
  {
    slug: 'crew-photos',
    category: 'trips_and_crews',
    title: 'Photos from the trip',
    summary: 'Where the photos of a trip end up.',
    body: 'Every photo stays with the trip.',
  },
  {
    slug: 'critter-photos',
    category: 'critters',
    title: 'Photos from the trip',
    summary: 'Where the photos of a trip end up.',
    body: 'Every photo stays with the trip.',
  },
  {
    slug: 'buying-critters',
    category: 'critters',
    title: 'Can I buy a critter?',
    summary: 'Critters are found on trips, never sold.',
    body: 'You meet critters by travelling.',
  },
];

async function search(query: string): Promise<{
  articles: { slug: string; locale: string }[];
  locale: string;
  fallback: boolean;
}> {
  const [status, body] = await h.get(me, `/v1/help/articles?${query}`);
  expect(status).toBe(200);
  return body as never;
}

beforeAll(async () => {
  h = await startHelpHarness();
  me = await h.anonymous();
  const releaseId = generateUuidV7();
  await h.rows(
    `INSERT INTO content_releases (id, kind, version, batch_key, title, status, stage, checksum,
       artifact, item_count, approved_by, approved_at, published_at)
     VALUES ($1, 'help', 1, 'help-search-test', 'Help', 'published', 'publish', repeat('0', 64),
       '{}', $2, $3, now(), now())`,
    [releaseId, ARTICLES.length, me.uid],
  );
  for (const article of ARTICLES) {
    await h.rows(
      `INSERT INTO help_articles (slug, locale, category, title, summary, body_md, release_id)
       VALUES ($1, 'en', $2, $3, $4, $5, $6)`,
      [article.slug, article.category, article.title, article.summary, article.body, releaseId],
    );
  }
}, 240_000);

afterAll(async () => {
  await h.stop();
});

describe('help search', () => {
  it('ranks the billing article first for a refund question', async () => {
    const result = await search('q=refund&locale=en');
    expect(result.articles[0]?.slug).toBe('pass-plus-refunds');
    expect(result.articles.map((a) => a.slug)).toContain('change-booking');
  });

  it('finds an article through a typo in its title', async () => {
    const result = await search(`q=${encodeURIComponent('ofline maps')}&locale=en`);
    expect(result.articles[0]?.slug).toBe('offline-maps');
  });

  it('lifts the category help was opened from', async () => {
    const fromCrew = await search('q=photos&locale=en&context=crew');
    const fromCritters = await search('q=photos&locale=en&context=critters');
    expect(fromCrew.articles[0]?.slug).toBe('crew-photos');
    expect(fromCritters.articles[0]?.slug).toBe('critter-photos');
  });

  it('falls back to English for a locale with no articles', async () => {
    const result = await search('q=refund&locale=vi');
    expect([result.locale, result.fallback]).toEqual(['en', true]);
    expect(result.articles[0]?.slug).toBe('pass-plus-refunds');
  });

  it('lists the context’s articles first for the hub when nothing is typed', async () => {
    const result = await search('locale=en&context=settings&limit=2');
    expect(result.articles.map((a) => a.slug)).toEqual(['trip-boost', 'buying-critters']);
    expect(result.fallback).toBe(false);
  });

  it('returns nothing for words no article has', async () => {
    const result = await search('q=zzqx&locale=en');
    expect(result.articles).toEqual([]);
  });
});
