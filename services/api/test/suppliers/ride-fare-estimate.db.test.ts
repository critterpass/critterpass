/**
 * The ride quote's tariff estimate on the real stack: Kyoto Station → Kiyomizu-dera routed through
 * the recorded Mapbox `driving-traffic` answer, priced with the committed ride tariff batch. While
 * the batch waits in review the range is served flagged unreviewed; once it is the live release it
 * counts as reviewed. The range comes in yen and in the crew's currency at the stored rate.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { generateUuidV7, type RideQuoteResult } from '@cp/domain';
import { createSupplierHttp } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerSupplierCommands } from '../../src/commands/suppliers';
import { createMapboxRoutingProvider } from '../../src/routing/eta';
import { MapboxRoutingClient } from '../../src/routing/mapbox';
import { createRideQuoter, registerRideQuoteRoute } from '../../src/suppliers/rides-quote';
import {
  buildMoneyCrew,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from '../money/money-harness';
import { loadExchanges, replayClient } from '../routing/http-fixtures';
import { KIYOMIZU_DERA, KYOTO_STATION } from '../routing/scenarios';

const BATCH = path.resolve(
  import.meta.dirname,
  '../../../../tools/content-factory/batches/ride_tariffs/2026-09-30-ride-tariffs-01.json',
);

let harness: MoneyHarness;
let crew: MoneyCrew;
let station: string;
let temple: string;
let releaseId: string;

const suppliers = createSupplierHttp({
  fetch: () => Promise.reject(new Error('no supplier is called for a tariff estimate')),
  audit: () => Promise.resolve(),
});

beforeAll(async () => {
  const http = replayClient(loadExchanges('kyoto-drive'));
  const routing = createMapboxRoutingProvider({
    client: new MapboxRoutingClient({ accessToken: 'test-token', http }),
  });
  harness = await startMoneyHarness(
    (registry) =>
      registerSupplierCommands(registry, { http: suppliers, links: {}, port: undefined }),
    (app, deps) => {
      const quoter = createRideQuoter({ pool: deps.pool, grab: undefined, routing });
      registerRideQuoteRoute(app, { sessions: deps.sessions, quoter });
    },
  );
  crew = await buildMoneyCrew(harness, 2);
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
     VALUES ('kyoto', 'Kyoto', 'JP', 'live', 'JPY', 'Asia/Tokyo')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  const kyoto = rows[0]!.id;
  await harness.pool.query('UPDATE trips SET destination_id = $1 WHERE id = $2', [
    kyoto,
    crew.tripId,
  ]);
  await harness.pool.query(
    `UPDATE crews SET settlement_currency = 'SGD' WHERE id = (SELECT crew_id FROM trips WHERE id = $1)`,
    [crew.tripId],
  );
  await harness.pool.query(
    `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
     VALUES ('SGD', 'JPY', 110, '2026-10-14', 'frankfurter')`,
  );
  const pois = await harness.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng) VALUES
       ($1, 'Kyoto Station', 'transit', $2, $3), ($1, 'Kiyomizu-dera', 'temple_shrine', $4, $5)
     RETURNING id`,
    [kyoto, KYOTO_STATION.lat, KYOTO_STATION.lng, KIYOMIZU_DERA.lat, KIYOMIZU_DERA.lng],
  );
  station = pois.rows[0]!.id;
  temple = pois.rows[1]!.id;
  const artifact = JSON.parse(readFileSync(BATCH, 'utf8')) as {
    checksum: string;
    items: unknown[];
  };
  releaseId = generateUuidV7();
  await harness.pool.query(
    `INSERT INTO content_releases (id, kind, version, batch_key, title, status, stage, checksum,
       artifact, item_count)
     VALUES ($1, 'ride_tariffs', 1, '2026-09-30-ride-tariffs-01', 'Ride tariffs', 'review', 'review',
       $2, $3, $4)`,
    [releaseId, artifact.checksum, JSON.stringify(artifact), artifact.items.length],
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function quote(): Promise<RideQuoteResult> {
  const response = await harness.request(
    `/v1/rides/quote?trip_id=${crew.tripId}&from_poi=${station}&to_poi=${temple}`,
    { headers: { cookie: crew.members[0]!.cookie } },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as RideQuoteResult;
}

describe('ride quote tariff estimate', () => {
  it('prices the routed trip with the Kyoto meter, in yen and the crew currency, unreviewed while in review', async () => {
    const body = await quote();
    expect(body.estimate).toBeNull();
    expect(body.fare_estimate).toMatchObject({
      copy_key: 'suppliers.rides.tariff_estimate',
      distance_m: 3546,
      duration_min: 15,
      traffic: true,
    });
    // 470 + 369.0037 × 2.646 km = 1446 → 1440; night rates with 15 slow minutes: 2815.7 → 2820.
    expect(body.fare_estimate?.options).toEqual([
      {
        ride_class: 'metered_taxi',
        operator: 'MK Taxi Kyoto',
        low_minor: 1440,
        high_minor: 2820,
        currency: 'JPY',
        basis: 'meter_tariff',
        peak_factor: null,
        minimum_applied: false,
        extras: [{ kind: 'dispatch', amount_minor: 300 }],
        crew: expect.objectContaining({ currency: 'SGD', fx_as_of: '2026-10-14' }) as unknown,
        sources: [expect.objectContaining({ url: 'https://www.mk-group.co.jp/kyoto/taxi/' })],
        checked_at: '2026-09-30',
        reviewed: false,
      },
    ]);
    const crewRange = body.fare_estimate?.options[0]?.crew;
    expect(crewRange?.low_minor).toBe(Math.round((1440 / 110) * 100));
  });

  it('counts the tariffs as reviewed once the batch is the live release', async () => {
    await harness.pool.query(
      `UPDATE content_releases SET status = 'published', stage = 'publish', approved_by = $2,
         approved_at = now(), published_at = now() WHERE id = $1`,
      [releaseId, generateUuidV7()],
    );
    const other = crew.members[1]!;
    const response = await harness.request(
      `/v1/rides/quote?trip_id=${crew.tripId}&from_poi=${station}&to_poi=${temple}`,
      { headers: { cookie: other.cookie } },
    );
    const body = (await response.json()) as RideQuoteResult;
    expect(body.fare_estimate?.options.map((o) => o.reviewed)).toEqual([true]);
  });
});
