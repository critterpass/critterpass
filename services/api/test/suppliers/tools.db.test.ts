/**
 * The guide's supplier tools on the real stack, with Viator's published search sample and Grab's
 * published Farefeed sample at the network boundary. Offers reach the model as ids, a from price
 * and whether a hold is possible, never the supplier's text, and only while the Viator switch is
 * on; drafts answer a draft id and hold or send nothing; a ride quote is Grab's range or nothing.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createToolRegistry, type ToolRegistry } from '@cp/ai';
import { generateUuidV7 } from '@cp/domain';
import {
  createGrabTokenSource,
  createSupplierHttp,
  createViatorAdapter,
  GRAB_STAGING_URL,
  VIATOR_SANDBOX_URL,
} from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRideQuoter } from '../../src/suppliers/rides-quote';
import { registerSupplierToolExecutors } from '../../src/suppliers/tool-executors';
import {
  buildMoneyCrew,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from '../money/money-harness';
import type { SignedIn } from '../setup/setup-harness';

const SUPPLIERS = path.resolve(import.meta.dirname, '../../../../packages/suppliers/test');
const served: Record<string, string> = {
  '/partner/products/search': 'viator/fixtures/products-search-affiliates.json',
  '/grabid/v1/oauth2/token': 'grab/fixtures/oauth-token-published-sample.json',
  '/farefeed/v1/estimate': 'grab/fixtures/farefeed-estimate-published-sample.json',
};
const calls: string[] = [];

function recorded(input: string | URL): Promise<Response> {
  const pathname = new URL(input).pathname;
  calls.push(pathname);
  const file = served[pathname];
  if (file === undefined) return Promise.reject(new Error(`nothing served for ${pathname}`));
  return Promise.resolve(new Response(readFileSync(path.join(SUPPLIERS, file), 'utf8')));
}

const http = createSupplierHttp({ fetch: recorded, audit: () => Promise.resolve() });
const grabConfig = { clientId: 'cid', clientSecret: 'secret', baseUrl: GRAB_STAGING_URL };

let harness: MoneyHarness;
let crew: MoneyCrew;
let registry: ToolRegistry;
let poiId: string;

beforeAll(async () => {
  harness = await startMoneyHarness();
  crew = await buildMoneyCrew(harness, 2);
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
     VALUES ($1, 'Bali', 'Indonesia', 'live', 'USD', 'Asia/Makassar') RETURNING id`,
    [`bali-${generateUuidV7().slice(-8)}`],
  );
  await harness.pool.query('UPDATE trips SET destination_id = $1 WHERE id = $2', [
    rows[0]!.id,
    crew.tripId,
  ]);
  const poi = await harness.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, source_ids)
     VALUES ($1, 'Private tour', 'other', -8.5, 115.26, '{"viator_destination": "739", "viator": "62330P2"}')
     RETURNING id`,
    [rows[0]!.id],
  );
  poiId = poi.rows[0]!.id;
  registry = createToolRegistry();
  registerSupplierToolExecutors(registry, harness.pool, {
    quoter: createRideQuoter({
      pool: harness.pool,
      grab: { http, config: grabConfig, tokens: createGrabTokenSource(http, grabConfig) },
    }),
    port: createViatorAdapter({
      http,
      config: {
        apiKey: 'sandbox-key',
        baseUrl: VIATOR_SANDBOX_URL,
        hostingUrl: 'https://pay.test',
      },
    }),
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const member = () => crew.members[1] as SignedIn;
const context = () =>
  ({ uid: member().uid, tripId: crew.tripId, caller: 'C', route: 'guide.chat' }) as const;

async function partner(key: string, on: boolean): Promise<void> {
  await harness.pool.query('UPDATE ops.partner_adapters SET enabled = $2 WHERE partner = $1', [
    key,
    on,
  ]);
}

describe('bookable_activity', () => {
  const call = () =>
    registry.execute(
      {
        id: 'b1',
        name: 'bookable_activity',
        input: { poi_id: poiId, date: '2026-10-13', pax: 2 },
      },
      context(),
    );

  it('is unavailable while the Viator switch is off, and never calls Viator', async () => {
    await partner('viator_booking', false);
    const result = await call();
    expect(result.ok).toBe(false);
    expect(calls.filter((c) => c.includes('products'))).toHaveLength(0);
  });

  it("answers the place's offer as ids, a from price and no supplier text", async () => {
    await partner('viator_booking', true);
    const result = await call();
    expect(result.ok && result.output).toEqual({
      offers: [
        {
          offer_ref: '62330P2',
          supplier: 'viator',
          price_from_minor: 40232,
          currency: 'USD',
          hold_supported: false,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('Edinburgh');
  });
});

describe('drafts', () => {
  it('propose_hold answers a draft id and holds nothing', async () => {
    await partner('viator_booking', true);
    const result = await registry.execute(
      {
        id: 'h1',
        name: 'propose_hold',
        input: { offer_ref: '62330P2', date: '2026-10-13', time: '09:00', pax: 2 },
      },
      context(),
    );
    expect(result.ok && typeof (result.output as { draft_id?: unknown }).draft_id).toBe('string');
    const bad = await registry.execute(
      {
        id: 'h2',
        name: 'propose_hold',
        input: { offer_ref: '62330P2', date: '2026-10-13', time: '9am', pax: 2 },
      },
      context(),
    );
    expect(bad.ok).toBe(false);
    const orders = await harness.pool.query('SELECT 1 FROM supplier_orders WHERE trip_id = $1', [
      crew.tripId,
    ]);
    expect(orders.rows).toHaveLength(0);
  });

  it('propose_vendor_message needs a real place and sends nothing', async () => {
    const draft = (vendorRef: string) =>
      registry.execute(
        {
          id: 'v1',
          name: 'propose_vendor_message',
          input: { vendor_ref: vendorRef, intent: 'reserve', text: 'Table for 2 at 20:00?' },
        },
        context(),
      );
    expect((await draft(poiId)).ok).toBe(true);
    expect((await draft(generateUuidV7())).ok).toBe(false);
    const messages = await harness.pool.query('SELECT 1 FROM ops.vendor_messages');
    expect(messages.rows).toHaveLength(0);
  });
});

describe('ride_quote', () => {
  it("answers Grab's fare range while its switch is on, and nothing otherwise", async () => {
    const quote = () =>
      registry.execute(
        {
          id: 'r1',
          name: 'ride_quote',
          input: { from: { lat: -8.748, lng: 115.167 }, to: { lat: -8.5069, lng: 115.2625 } },
        },
        context(),
      );
    await partner('grab_farefeed', false);
    expect((await quote()).ok).toBe(false);
    await partner('grab_farefeed', true);
    const on = await quote();
    expect(on.ok && on.output).toMatchObject({
      provider: 'grab',
      fare_range_minor: { min: 5700, max: 7410 },
      currency: 'SGD',
      eta_min: 3,
    });
  });
});
