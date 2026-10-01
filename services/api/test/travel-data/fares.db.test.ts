/**
 * `/v1/fares`, `freezeFareQuote` and the `fare_calendar` tool over the real stack: fresh fares
 * carry a price and "seen" time, stale and missing ones never carry a number, a thin origin borrows
 * its nearest hub's fare under a label, and only a fresh fare can be frozen into a quote.
 */
import { createToolRegistry } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { freezeFareQuote } from '../../src/travel-data/fares-read';
import { registerTravelDataRoutes } from '../../src/travel-data/routes';
import { registerTravelDataToolExecutors } from '../../src/travel-data/tool-executors';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';
import { seedFareCell, seedLiveDestinations } from './travel-seed';

let harness: CommandDoorsHarness;
let destinations: Record<string, string>;
const HOUR = 3_600_000;

interface FaresBody {
  destination_id: string;
  dest_iata: string | null;
  month: string;
  fares: {
    origin: string;
    state: string;
    price_minor: number | null;
    source: string;
    seen_at: string | null;
    via_hub: string | null;
    days: unknown[];
  }[];
}

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerTravelDataRoutes(app, deps),
  );
  destinations = await seedLiveDestinations(harness.pool);
  const bali = destinations['bali'] ?? '';
  const now = Date.now();
  await seedFareCell(harness.pool, {
    origin: 'SIN',
    dest: 'DPS',
    destinationId: bali,
    month: '2026-11',
    priceMinor: 13_900,
    fetchedAt: new Date(now - 2 * HOUR),
  });
  await seedFareCell(harness.pool, {
    origin: 'KUL',
    dest: 'DPS',
    destinationId: bali,
    month: '2026-11',
    priceMinor: 9_900,
    fetchedAt: new Date(now - 80 * HOUR),
  });
  await seedFareCell(harness.pool, {
    origin: 'HKG',
    dest: 'DPS',
    destinationId: bali,
    month: '2026-11',
    priceMinor: 31_000,
    fetchedAt: new Date(now - 5 * HOUR),
  });
  await seedFareCell(harness.pool, {
    origin: 'HAN',
    dest: 'DPS',
    destinationId: bali,
    month: '2026-11',
    priceMinor: null,
    fetchedAt: null,
  });
  await harness.pool.query(
    `INSERT INTO cities (name, country, lat, lng, population, iata_nearby)
     VALUES ('Hanoi', 'VN', 21.0285, 105.8542, 8000000, '{HAN}')`,
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function getFares(query: string): Promise<{ status: number; body: FaresBody }> {
  const me = await harness.signInAnonymously();
  const response = await harness.request(`/v1/fares?${query}`, { headers: { cookie: me.cookie } });
  return { status: response.status, body: (await response.json()) as FaresBody };
}

describe('GET /v1/fares', () => {
  it('returns each origin with its state, source and seen time', async () => {
    const { status, body } = await getFares('origins=SIN,KUL,HAN&dest=bali&month=2026-11');
    expect(status).toBe(200);
    expect(body).toMatchObject({ destination_id: destinations['bali'], dest_iata: 'DPS' });
    const [sin, kul, han] = body.fares;
    expect(sin).toMatchObject({ origin: 'SIN', state: 'ok', price_minor: 13_900, via_hub: null });
    expect(sin?.source).toBe('travelpayouts');
    expect(sin?.seen_at).not.toBeNull();
    expect(sin?.days).toHaveLength(1);
    // Older than 72 h: "no recent price", never the old number.
    expect(kul).toMatchObject({ origin: 'KUL', state: 'stale', price_minor: null, days: [] });
    // Nothing for Hanoi itself: its nearest hub's fresh fare, labelled as borrowed.
    expect(han).toMatchObject({ origin: 'HAN', state: 'ok', price_minor: 31_000, via_hub: 'HKG' });
  });

  it('accepts a destination airport code and reports a never-priced origin as missing', async () => {
    const { body } = await getFares('origins=BKK&dest=DPS&month=2026-11');
    expect(body.fares).toEqual([
      expect.objectContaining({ origin: 'BKK', state: 'missing', price_minor: null }),
    ]);
  });

  it('rejects bad input and unknown destinations, and requires a session', async () => {
    expect((await getFares('origins=SINGAPORE&dest=bali&month=2026-11')).status).toBe(422);
    expect((await getFares('origins=SIN&dest=bali&month=2026-13')).status).toBe(422);
    expect((await getFares('origins=SIN&dest=atlantis&month=2026-11')).status).toBe(404);
    expect((await harness.request('/v1/fares?origins=SIN&dest=bali&month=2026-11')).status).toBe(
      401,
    );
  });
});

describe('freezeFareQuote', () => {
  it('pins a fresh fare as a flight price quote', async () => {
    const quote = await freezeFareQuote(harness.pool, {
      tripId: null,
      origin: 'SIN',
      destinationId: destinations['bali'] ?? '',
      destIata: 'DPS',
      month: '2026-11',
    });
    expect(quote).toMatchObject({ amount_minor: 13_900, currency: 'USD', version: 1 });
    const { rows } = await harness.pool.query(
      'SELECT kind, source, origin, amount_minor::int, dates::text FROM price_quotes WHERE id = $1',
      [quote.quote_id],
    );
    expect(rows).toEqual([
      {
        kind: 'flight',
        source: 'travelpayouts',
        origin: 'SIN',
        amount_minor: 13_900,
        dates: '[2026-11-11,2026-11-20)',
      },
    ]);
  });

  it('refuses to freeze a stale or missing fare', async () => {
    for (const origin of ['KUL', 'HAN']) {
      await expect(
        freezeFareQuote(harness.pool, {
          tripId: null,
          origin,
          destinationId: destinations['bali'] ?? '',
          destIata: 'DPS',
          month: '2026-11',
        }),
      ).rejects.toMatchObject({ code: 'STATE_INVALID', detail: { reason: 'no_recent_price' } });
    }
  });
});

describe('fare_calendar tool', () => {
  it('lists fresh per-day fares only, under the airport they are really from', async () => {
    const registry = createToolRegistry();
    registerTravelDataToolExecutors(registry, harness.pool);
    const me = await harness.signInAnonymously();
    const result = await registry.execute(
      {
        id: 'call-1',
        name: 'fare_calendar',
        input: { origins: ['SIN', 'KUL', 'HAN'], dest: 'bali', month: '2026-11' },
      },
      { uid: me.uid, tripId: null, caller: 'C', route: 'guide.chat' },
    );
    expect(result.ok).toBe(true);
    const output = result.ok ? (result.output as { origin: string; price_minor: number }[]) : [];
    expect(output.map((entry) => [entry.origin, entry.price_minor])).toEqual([
      ['SIN', 13_900],
      ['HKG', 31_000],
    ]);
  });
});
