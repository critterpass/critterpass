/**
 * A destination's links and the ways to reach it from a home city, read over HTTP on real Postgres
 * with a real pg-boss producer: links come ranked with their sources and an estimate flag, a
 * destination with none queues its links run, and a pair of places nobody has asked for queues its
 * write once and reads `pending` until the stored answer is there for every traveller from that
 * city.
 */
import { withSystem } from '@cp/db';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startJobProducer } from '../../src/jobs/producer';
import type { GettingThere } from '../../src/routes/destination-getting-there';
import type { DestinationLinks } from '../../src/routes/destination-links';
import { registerSharedContentRoutes } from '../../src/routes/shared-content';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from './command-doors-harness';

let harness: CommandDoorsHarness;
let producer: PgBoss;
let me: SignedIn;
let other: SignedIn;
let cusco: string;
let machuPicchu: string;
let puno: string;

const SOURCE = {
  url: 'https://example.pe/machu-picchu-by-train',
  title: 'Machu Picchu by train',
  quote: 'The train from Cusco to Machu Picchu takes about 3.5 hours.',
};

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerSharedContentRoutes(app, deps),
  );
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  me = await harness.signInAnonymously();
  other = await harness.signInAnonymously();
  await withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ slug: string; id: string }>(
      `INSERT INTO destinations (slug, name, country, coverage, currency, tz) VALUES
         ('cusco', 'Cusco', 'Peru', 'live', 'PEN', 'America/Lima'),
         ('pe-machu-picchu', 'Machu Picchu', 'Peru', 'area', 'PEN', 'America/Lima'),
         ('pe-puno', 'Puno', 'Peru', 'guest', 'PEN', 'America/Lima')
       RETURNING slug, id`,
    );
    const id = (slug: string) => rows.find((row) => row.slug === slug)?.id ?? '';
    [cusco, machuPicchu, puno] = [id('cusco'), id('pe-machu-picchu'), id('pe-puno')];
    await tx.query(
      `INSERT INTO destination_links
         (key, from_destination_id, to_destination_id, kind, minutes, mode, day_length, essential,
          cost_pp_minor, cost_currency, note, i18n, position, origin, sources)
       VALUES
         ('cusco>pe-puno:onward', $1, $3, 'onward', 450, 'bus', NULL, NULL, NULL, NULL, NULL, NULL,
          0, 'editorial', '[]'),
         ('cusco>pe-machu-picchu:day_trip', $1, $2, 'day_trip', 210, 'train', 'full', true, 7000,
          'USD', 'The train leaves from Poroy.', '{"vi": {"note": "Tàu khởi hành từ Poroy."}}', 0,
          'ai', $4)`,
      [cusco, machuPicchu, puno, JSON.stringify([SOURCE])],
    );
    await tx.query("UPDATE users SET home_airport = 'SGN' WHERE id = $1", [me.uid]);
  });
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await harness?.stop();
});

async function read<T>(path: string, who: SignedIn = me, headers: Record<string, string> = {}) {
  const response = await harness.request(path, { headers: { cookie: who.cookie, ...headers } });
  const text = await response.text();
  return {
    status: response.status,
    etag: response.headers.get('etag'),
    cache: response.headers.get('cache-control'),
    body: (text === '' ? null : JSON.parse(text)) as T,
  };
}

async function jobs(queue: string): Promise<unknown[]> {
  const { rows } = await harness.pool.query<{ data: unknown }>(
    'SELECT data FROM pgboss.job WHERE name = $1 ORDER BY created_on',
    [queue],
  );
  return rows.map((row) => row.data);
}

describe('GET /v1/destinations/{id}/links', () => {
  it('answers day trips before onward links, a written one as an estimate with its sources', async () => {
    const { status, body, cache, etag } = await read<DestinationLinks>(
      `/v1/destinations/${cusco}/links`,
    );
    expect(status).toBe(200);
    expect(cache).toBe('private, max-age=300');
    expect(body.destination_id).toBe(cusco);
    expect(body.links).toEqual([
      {
        id: expect.any(String) as string,
        kind: 'day_trip',
        to: { id: machuPicchu, slug: 'pe-machu-picchu', name: 'Machu Picchu', coverage: 'area' },
        minutes: 210,
        mode: 'train',
        day_length: 'full',
        essential: true,
        cost_pp_minor: 7000,
        cost_currency: 'USD',
        note: 'The train leaves from Poroy.',
        estimate: true,
        sources: [SOURCE],
      },
      expect.objectContaining({
        kind: 'onward',
        to: expect.objectContaining({ id: puno }) as unknown,
        minutes: 450,
        day_length: null,
        essential: false,
        estimate: false,
        sources: [],
      }),
    ]);
    const again = await read('/v1/destinations/cusco/links', me, { 'if-none-match': etag ?? '' });
    expect(again.status).toBe(304);
    expect(await jobs('places.destination_brief')).toEqual([]);
  });

  it('queues the links run of a destination that has none, once', async () => {
    const first = await read<DestinationLinks>(`/v1/destinations/${puno}/links`);
    expect(first.body).toEqual({ destination_id: puno, links: [] });
    await read(`/v1/destinations/${puno}/links`, other);
    expect(await jobs('places.destination_brief')).toEqual([{ destination_id: puno }]);
  });

  it('needs a session and a known destination', async () => {
    expect((await harness.request(`/v1/destinations/${cusco}/links`)).status).toBe(401);
    expect((await read(`/v1/destinations/${crypto.randomUUID()}/links`)).status).toBe(404);
  });
});

describe('GET /v1/destinations/{id}/getting-there', () => {
  it('queues the pair once from the caller’s home and reads pending, uncached', async () => {
    const first = await read<GettingThere>(`/v1/destinations/${cusco}/getting-there`);
    expect(first.status).toBe(200);
    expect(first.cache).toBe('no-store');
    expect(first.body).toEqual({
      destination_id: cusco,
      origin: { key: 'SGN', city: 'Ho Chi Minh City', country: 'VN' },
      status: 'pending',
      ways: [],
      generated_at: null,
    });
    // Another traveller from the same city asks for the same pair: still one job, and no person
    // in it.
    await read(`/v1/destinations/${cusco}/getting-there?from=sgn`, other);
    expect(await jobs('places.home_link')).toEqual([{ destination_id: cusco, origin: 'SGN' }]);
  });

  it('answers the stored ways to every traveller from that city', async () => {
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO destination_home_links
           (destination_id, origin_key, origin_name, status, ways, generated_at, expires_at)
         VALUES ($1, 'SGN', 'Ho Chi Minh City', 'ready', $2, now(), now() + interval '30 days'),
                ($1, 'HAN', 'Hanoi', 'declined', '[]', NULL, now() + interval '7 days')`,
        [
          cusco,
          JSON.stringify([
            {
              mode: 'flight',
              minutes: 1500,
              cost_pp_minor: 120000,
              cost_currency: 'USD',
              note: { en: 'At least two changes.' },
              sources: [SOURCE],
            },
          ]),
        ],
      ),
    );
    const mine = await read<GettingThere>(`/v1/destinations/${cusco}/getting-there`);
    expect(mine.cache).toBe('private, max-age=300');
    expect(mine.body).toMatchObject({
      status: 'ready',
      ways: [
        {
          mode: 'flight',
          minutes: 1500,
          cost_pp_minor: 120000,
          cost_currency: 'USD',
          note: 'At least two changes.',
          sources: [SOURCE],
        },
      ],
    });
    const theirs = await read<GettingThere>(`/v1/destinations/cusco/getting-there?from=SGN`, other);
    expect(theirs.body.ways).toEqual(mine.body.ways);
    const none = await read<GettingThere>(`/v1/destinations/${cusco}/getting-there?from=HAN`);
    expect(none.body).toMatchObject({ status: 'none', ways: [] });
    expect(await jobs('places.home_link')).toHaveLength(1);
  });

  it('refuses an unknown home and a caller with none', async () => {
    expect((await read(`/v1/destinations/${cusco}/getting-there?from=ZZZ`)).status).toBe(422);
    expect((await read(`/v1/destinations/${cusco}/getting-there`, other)).status).toBe(422);
  });
});
