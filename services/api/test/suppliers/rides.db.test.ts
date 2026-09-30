/**
 * Rides on the real stack, with Grab's published Farefeed samples at the network boundary. Denpasar
 * airport → Ubud: switched off, the quote is plain Grab and Gojek links plus the phrase card and
 * Grab is never called; switched on, it is Grab's fare range, pickup time and deep link, kept for
 * the offline card and cached 60 s. Outsiders get nothing. "LOG IT" keeps the ride and splits its
 * amount between the riders once, however often it is replayed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { generateUuidV7, type LogRideResult, type RideQuoteResult } from '@cp/domain';
import { createGrabTokenSource, createSupplierHttp, GRAB_STAGING_URL } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerSupplierCommands } from '../../src/commands/suppliers';
import { createRideQuoter, registerRideQuoteRoute } from '../../src/suppliers/rides-quote';
import {
  buildMoneyCrew,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from '../money/money-harness';
import { resultOf, type SignedIn } from '../setup/setup-harness';

const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../../../packages/suppliers/test/grab/fixtures',
);
const served: Record<string, string> = {
  '/grabid/v1/oauth2/token': 'oauth-token-published-sample.json',
  '/farefeed/v1/estimate': 'farefeed-estimate-published-sample.json',
};
const calls: string[] = [];

function grabFetch(input: string | URL): Promise<Response> {
  const pathname = new URL(input).pathname;
  calls.push(pathname);
  const file = served[pathname];
  if (file === undefined) return Promise.reject(new Error(`nothing served for ${pathname}`));
  return Promise.resolve(new Response(readFileSync(path.join(FIXTURES, file), 'utf8')));
}

const http = createSupplierHttp({ fetch: grabFetch, audit: () => Promise.resolve() });
const grabConfig = { clientId: 'cid', clientSecret: 'secret', baseUrl: GRAB_STAGING_URL };
let clock = new Date('2026-10-14T02:00:00Z');

let harness: MoneyHarness;
let crew: MoneyCrew;
let airport: string;
let ubud: string;
let outsider: SignedIn;

beforeAll(async () => {
  harness = await startMoneyHarness(
    (registry) => registerSupplierCommands(registry, { http, links: {}, port: undefined }),
    (app, deps) => {
      const quoter = createRideQuoter({
        pool: deps.pool,
        grab: { http, config: grabConfig, tokens: createGrabTokenSource(http, grabConfig) },
        now: () => clock,
      });
      registerRideQuoteRoute(app, { sessions: deps.sessions, quoter });
    },
  );
  crew = await buildMoneyCrew(harness, 3);
  outsider = await harness.signIn();
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
     VALUES ($1, 'Bali', 'Indonesia', 'live', 'IDR', 'Asia/Makassar') RETURNING id`,
    [`bali-${generateUuidV7().slice(-8)}`],
  );
  const bali = rows[0]!.id;
  await harness.pool.query('UPDATE trips SET destination_id = $1 WHERE id = $2', [
    bali,
    crew.tripId,
  ]);
  const pois = await harness.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, name_local, category, lat, lng, address) VALUES
       ($1, 'Ngurah Rai airport', 'Bandar Udara Internasional I Gusti Ngurah Rai', 'transit',
        -8.748, 115.167, 'Jl. Raya Gusti Ngurah Rai'),
       ($1, 'Ubud Palace', 'Puri Saren Agung', 'temple_shrine', -8.5069, 115.2625, 'Jl. Raya Ubud No.8')
     RETURNING id`,
    [bali],
  );
  airport = pois.rows[0]!.id;
  ubud = pois.rows[1]!.id;
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const members = () => crew.members as [SignedIn, SignedIn, SignedIn];

async function grabSwitch(on: boolean): Promise<void> {
  await harness.pool.query(
    "UPDATE ops.partner_adapters SET enabled = $1 WHERE partner = 'grab_farefeed'",
    [on],
  );
}

async function quote(session: SignedIn): Promise<Response> {
  return harness.request(
    `/v1/rides/quote?trip_id=${crew.tripId}&from_poi=${airport}&to_poi=${ubud}`,
    { headers: { cookie: session.cookie } },
  );
}

describe('ride quote', () => {
  it('switched off: plain Grab and Gojek links and the phrase card, and Grab is never called', async () => {
    await grabSwitch(false);
    const response = await quote(members()[0]);
    expect(response.status).toBe(200);
    const body = (await response.json()) as RideQuoteResult;
    expect(body.estimate).toBeNull();
    expect(body.copy_key).toBe('suppliers.rides.open_app');
    expect(body.links.map((link) => link.provider)).toEqual(['grab', 'gojek']);
    expect(body.phrase_card).toMatchObject({ name: 'Ubud Palace', name_local: 'Puri Saren Agung' });
    expect(calls).toHaveLength(0);
  });

  it("switched on: Grab's fare range, pickup time and deep link, kept for offline and cached 60 s", async () => {
    await grabSwitch(true);
    clock = new Date(clock.getTime() + 61_000);
    const body = (await (await quote(members()[1])).json()) as RideQuoteResult;
    expect(body.copy_key).toBe('suppliers.rides.grab_estimate');
    expect(body.estimate).toMatchObject({
      provider: 'grab',
      service: 'JustGrab',
      eta_min: 3,
      fare_low_minor: 5700,
      fare_high_minor: 7410,
      currency: 'SGD',
      surge: 'low',
    });
    const { rows } = await harness.pool.query(
      'SELECT user_id, from_poi_id, to_poi_id, fare_low_minor::int AS low FROM ride_quotes WHERE id = $1',
      [body.estimate?.quote_id],
    );
    expect(rows).toEqual([
      { user_id: members()[1].uid, from_poi_id: airport, to_poi_id: ubud, low: 5700 },
    ]);
    const before = calls.length;
    await quote(members()[1]);
    expect(calls.length).toBe(before);
  });

  it('answers NOT_FOUND to someone outside the trip', async () => {
    const response = await quote(outsider);
    expect(response.status).toBe(404);
  });
});

describe('log_ride', () => {
  it('keeps the ride and splits its amount between the riders once, however often replayed', async () => {
    const [organiser, maya, dev] = members();
    const payload = {
      ride_id: generateUuidV7(),
      trip_id: crew.tripId,
      leg_ref: 'villa-to-warung',
      provider: 'grab',
      amount_minor: 6000000,
      currency: 'IDR',
      attendee_ids: [organiser.uid, maya.uid, dev.uid],
      expense_id: generateUuidV7(),
      fx_snapshot_id: crew.idrSnapshotId,
    };
    const first = resultOf<LogRideResult>(await harness.run(organiser, 'log_ride', payload));
    const again = resultOf<LogRideResult>(await harness.run(organiser, 'log_ride', payload));
    expect(first).toEqual({ ride_id: payload.ride_id, expense_id: payload.expense_id });
    expect(again).toEqual(first);
    const expense = await harness.pool.query(
      `SELECT source, category, payer_id FROM expenses WHERE id = $1`,
      [payload.expense_id],
    );
    expect(expense.rows).toEqual([
      { source: 'ride', category: 'transit', payer_id: organiser.uid },
    ]);
    const shares = await harness.pool.query(
      'SELECT count(*)::int AS n FROM expense_shares WHERE expense_id = $1',
      [payload.expense_id],
    );
    expect(shares.rows[0]).toEqual({ n: 3 });
    const ride = await harness.pool.query(
      'SELECT expense_id, mode, price_minor::int AS price FROM rides WHERE id = $1',
      [payload.ride_id],
    );
    expect(ride.rows).toEqual([
      { expense_id: payload.expense_id, mode: 'app_link', price: 6000000 },
    ]);
  });

  it('logs a ride without an amount and refuses a rider outside the trip', async () => {
    const [organiser] = members();
    const bare = resultOf<LogRideResult>(
      await harness.run(organiser, 'log_ride', {
        ride_id: generateUuidV7(),
        trip_id: crew.tripId,
        leg_ref: 'airport-pickup',
        provider: 'taxi',
      }),
    );
    expect(bare.expense_id).toBeNull();
    const refused = await harness.run(organiser, 'log_ride', {
      ride_id: generateUuidV7(),
      trip_id: crew.tripId,
      leg_ref: 'x',
      provider: 'grab',
      attendee_ids: [outsider.uid],
    });
    expect(refused.status).toBe(422);
  });
});
