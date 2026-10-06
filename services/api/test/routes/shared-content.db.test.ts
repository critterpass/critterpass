/**
 * Shared content over HTTP: the ideas board, the help centre's articles, a destination's season and cost indices and a place's
 * crowd curves. Each read answers only what its sync stream sends (reviewed, approved, published),
 * needs a session, and carries five minutes of private cache with an ETag that answers 304.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DestinationCostIndices } from '../../src/routes/destination-cost-indices';
import type { DestinationSeason } from '../../src/routes/destination-season';
import type { BoardIdea } from '../../src/routes/help-ideas';
import type { HelpLibrary } from '../../src/routes/help-library';
import type { PlaceCrowdForecasts } from '../../src/routes/place-crowd-forecasts';
import { registerSharedContentRoutes } from '../../src/routes/shared-content';
import { seedLiveDestinations } from '../travel-data/travel-seed';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from './command-doors-harness';

let harness: CommandDoorsHarness;
let me: SignedIn;
let kyoto: string;
let lisbon: string;
let shrine: string;

const CURVE = Array.from({ length: 24 }, (_, hour) => (hour * 4) % 100);

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerSharedContentRoutes(app, deps),
  );
  me = await harness.signInAnonymously();
  const destinations = await seedLiveDestinations(harness.pool);
  kyoto = destinations['kyoto'] ?? '';
  lisbon = destinations['lisbon'] ?? '';
  await withSystem(harness.pool, async (tx) => {
    await tx.query(
      `INSERT INTO season_months (destination_id, month, crowd_index, colour_role, source,
         sourced_on, reviewed_at)
       SELECT $1, m, 40 + m, CASE WHEN m = 4 THEN 'peak' ELSE 'normal' END, 'Kyoto City Survey',
              '2026-09-28', CASE WHEN m = 12 THEN NULL ELSE now() END
         FROM generate_series(1, 12) AS m`,
      [kyoto],
    );
    await tx.query(
      `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, source,
         sourced_on, reviewed_at)
       VALUES ($1, 'gion-matsuri', 'festival', 'Gion Matsuri', '2027-07-01', '2027-07-31',
               'Yasaka Shrine', '2026-09-28', now()),
              ($1, 'cherry-blossom', 'blossom', 'Cherry blossom', '2027-03-28', '2027-04-08',
               'JMC', '2026-09-28', now()),
              ($1, 'draft-fair', 'festival', 'Draft fair', '2027-05-01', '2027-05-02',
               'Unchecked blog', '2026-09-28', NULL)`,
      [kyoto],
    );
    await tx.query(
      `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low,
         nightly_minor_high, food_pp_day_minor, fun_pp_day_minor, currency, source, sourced_on,
         reviewed_at)
       VALUES ($1, 'hotel', 1200000, 2500000, 400000, 300000, 'JPY', 'Survey', '2026-09-28', now()),
              ($1, 'hostel', 300000, 600000, 250000, 200000, 'JPY', 'Survey', '2026-09-28', now()),
              ($1, 'ryokan', 3000000, 6000000, 600000, 300000, 'JPY', 'Blog', '2026-09-28', NULL)`,
      [kyoto],
    );
    const poi = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Kiyomizu-dera', 'temple_shrine', 34.9949, 135.785) RETURNING id`,
      [kyoto],
    );
    shrine = poi.rows[0]?.id ?? '';
    await tx.query(
      `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at, approved_at)
       VALUES ($1, 1, $2, 'besttime', now(), NULL),
              ($1, 1, $2, 'editorial', now(), now()),
              ($1, 2, $2, 'editorial', now(), NULL)`,
      [shrine, CURVE],
    );
    const live = crypto.randomUUID();
    const review = crypto.randomUUID();
    await tx.query(
      `INSERT INTO content_releases (id, kind, version, batch_key, title, status, stage, checksum,
         artifact, item_count, approved_by, approved_at, published_at)
       VALUES ($1, 'help', 1, 'help-library-live', 'Help', 'published', 'publish',
               repeat('0', 64), '{}', 3, $3, now(), now()),
              ($2, 'help', 2, 'help-library-review', 'Help', 'review', 'review',
               repeat('1', 64), '{}', 1, NULL, NULL, NULL)`,
      [live, review, me.uid],
    );
    await tx.query(
      `INSERT INTO help_articles (slug, locale, category, title, summary, body_md, release_id)
       VALUES ('refunds', 'en', 'refunds', 'Refunds', 'How refunds work.', '# Refunds', $1),
              ('refunds', 'vi', 'refunds', 'Hoàn tiền', 'Cách hoàn tiền.', '# Hoàn tiền', $1),
              ('refunds', 'ja', 'refunds', '返金', '返金について。', '# 返金', $1),
              ('unreleased', 'en', 'refunds', 'Unreleased', 'Still in review.', '# Soon', $2)`,
      [live, review],
    );
    await tx.query(
      `INSERT INTO ideas (title, locale, status, votes_count, author_id)
       VALUES ('Split costs by the night', 'en', 'open', 3, NULL),
              ('Offline maps for every city', 'en', 'shipped', 9, NULL),
              ('My own idea still in review', 'en', 'pending_review', 0, $1)`,
      [me.uid],
    );
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function read<T>(path: string, headers: Record<string, string> = {}) {
  const response = await harness.request(path, { headers: { cookie: me.cookie, ...headers } });
  const text = await response.text();
  return {
    status: response.status,
    etag: response.headers.get('etag'),
    cache: response.headers.get('cache-control'),
    body: (text === '' ? null : JSON.parse(text)) as T,
  };
}

describe('GET /v1/help/ideas', () => {
  it('lists the published board most voted first, never an idea in review, even its author’s', async () => {
    const { status, body, cache } = await read<{ ideas: BoardIdea[] }>('/v1/help/ideas');
    expect(status).toBe(200);
    expect(cache).toBe('private, max-age=300');
    const titles = body.ideas.map((idea) => idea.title);
    expect(titles.indexOf('Offline maps for every city')).toBeLessThan(
      titles.indexOf('Split costs by the night'),
    );
    expect(titles).not.toContain('My own idea still in review');
    expect(body.ideas[0]).not.toHaveProperty('author_id');
  });

  it('filters by a board status and rejects one that is not on the board', async () => {
    const shipped = await read<{ ideas: BoardIdea[] }>('/v1/help/ideas?status=shipped');
    expect(shipped.body.ideas.every((idea) => idea.status === 'shipped')).toBe(true);
    expect((await read('/v1/help/ideas?status=pending_review')).status).toBe(422);
  });

  it('needs a session', async () => {
    expect((await harness.request('/v1/help/ideas')).status).toBe(401);
  });
});

describe('GET /v1/help/library', () => {
  it('answers the published articles of the language and of English, with their bodies', async () => {
    const { status, body, cache, etag } = await read<HelpLibrary>('/v1/help/library?locale=vi-VN');
    expect(status).toBe(200);
    expect(cache).toBe('private, max-age=300');
    expect(body.articles.map((article) => [article.slug, article.locale]).sort()).toEqual([
      ['refunds', 'en'],
      ['refunds', 'vi'],
    ]);
    expect(body.articles.find((article) => article.locale === 'vi')).toEqual({
      slug: 'refunds',
      locale: 'vi',
      category: 'refunds',
      title: 'Hoàn tiền',
      summary: 'Cách hoàn tiền.',
      body_md: '# Hoàn tiền',
    });
    const again = await read('/v1/help/library?locale=vi-VN', { 'if-none-match': etag ?? '' });
    expect(again.status).toBe(304);
  });

  it('answers English alone by default, rejects a malformed locale and needs a session', async () => {
    const english = await read<HelpLibrary>('/v1/help/library');
    expect(english.body.articles.map((article) => article.slug)).toEqual(['refunds']);
    expect((await read('/v1/help/library?locale=not_a_locale')).status).toBe(422);
    expect((await harness.request('/v1/help/library?locale=en')).status).toBe(401);
  });
});

describe('GET /v1/destinations/{id}/season', () => {
  it('answers the reviewed months and events only, by id or slug, with a 304 on a matching ETag', async () => {
    const byId = await read<DestinationSeason>(`/v1/destinations/${kyoto}/season`);
    expect(byId.status).toBe(200);
    expect(byId.body.months.map((row) => row.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(byId.body.months[3]).toMatchObject({ crowd_index: 44, colour_role: 'peak' });
    expect(byId.body.events.map((event) => event.key)).toEqual(['cherry-blossom', 'gion-matsuri']);

    const bySlug = await read<DestinationSeason>('/v1/destinations/kyoto/season');
    expect(bySlug.etag).toBe(byId.etag);
    const again = await read(`/v1/destinations/${kyoto}/season`, {
      'if-none-match': byId.etag ?? '',
    });
    expect(again.status).toBe(304);
  });

  it('answers empty for a destination with nothing reviewed and 404 for an unknown one', async () => {
    const empty = await read<DestinationSeason>(`/v1/destinations/${lisbon}/season`);
    expect(empty.body).toEqual({ destination_id: lisbon, months: [], events: [] });
    expect((await read(`/v1/destinations/${crypto.randomUUID()}/season`)).status).toBe(404);
  });
});

describe('GET /v1/destinations/{id}/cost-indices', () => {
  it('answers the reviewed stay types cheapest first, amounts as numbers', async () => {
    const { status, body, cache } = await read<DestinationCostIndices>(
      `/v1/destinations/${kyoto}/cost-indices`,
    );
    expect(status).toBe(200);
    expect(cache).toBe('private, max-age=300');
    expect(body.indices.map((row) => row.stay_type)).toEqual(['hostel', 'hotel']);
    expect(body.indices[0]).toMatchObject({
      nightly_minor_low: 300000,
      nightly_minor_high: 600000,
      food_pp_day_minor: 250000,
      currency: 'JPY',
    });
  });
});

describe('GET /v1/places/{id}/crowd-forecasts', () => {
  it('answers every curve but an unapproved editorial one', async () => {
    const { status, body } = await read<PlaceCrowdForecasts>(
      `/v1/places/${shrine}/crowd-forecasts`,
    );
    expect(status).toBe(200);
    expect(body.curves.map((curve) => [curve.dow, curve.source])).toEqual([
      [1, 'besttime'],
      [1, 'editorial'],
    ]);
    expect(body.curves[0]?.hourly).toEqual(CURVE);
  });

  it('is 404 for an unknown place', async () => {
    expect((await read(`/v1/places/${crypto.randomUUID()}/crowd-forecasts`)).status).toBe(404);
    expect((await read('/v1/places/not-a-place/crowd-forecasts')).status).toBe(404);
  });
});
