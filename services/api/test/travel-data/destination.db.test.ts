/**
 * `/v1/destinations/{id}` and `upsert_season_editorial` over the real stack, with Kyoto's editorial
 * season file as a content reviewer would approve it: the reviewed curve with its spring and autumn
 * peaks, the coming year's events, per-origin fares for the chosen month, and the FX chip. Bali has
 * no reviewed curve, so it answers `curve: null` with its best months instead.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createToolRegistry } from '@cp/ai';
import { withSystem } from '@cp/db';
import { seasonSeedFileSchema, type PolicyActor } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DestinationInsights } from '../../src/travel-data/destination-route';
import { registerTravelDataRoutes } from '../../src/travel-data/routes';
import { handleUpsertSeasonEditorial } from '../../src/travel-data/season-admin';
import { registerTravelDataToolExecutors } from '../../src/travel-data/tool-executors';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';
import { seedFareCell, seedLiveDestinations } from './travel-seed';

const SEED_DIR = path.resolve(import.meta.dirname, '../../../../packages/db/seed/season');
const kyotoSeed = seasonSeedFileSchema.parse(
  JSON.parse(readFileSync(path.join(SEED_DIR, 'kyoto.json'), 'utf8')),
);
const CONTENT: PolicyActor = {
  uid: crypto.randomUUID(),
  isAnonymous: false,
  roles: ['content'],
  via: 'app',
};

let harness: CommandDoorsHarness;
let destinations: Record<string, string>;

function monthAhead(offset: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return date.toISOString().slice(0, 7);
}

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerTravelDataRoutes(app, deps),
  );
  destinations = await seedLiveDestinations(harness.pool);
  const kyoto = destinations['kyoto'] ?? '';
  await withSystem(harness.pool, async (tx) => {
    await handleUpsertSeasonEditorial(tx, CONTENT, {
      destination_id: kyoto,
      months: kyotoSeed.months,
      events: kyotoSeed.events,
      approve: true,
    });
    await tx.query("UPDATE destinations SET best_months = '{3,4,10,11}' WHERE slug = 'bali'");
    await tx.query(
      `INSERT INTO fx_snapshots (base, quote, rate, as_of, source) VALUES
         ('EUR', 'JPY', 165.5, CURRENT_DATE, 'frankfurter'),
         ('EUR', 'USD', 1.1100, CURRENT_DATE, 'frankfurter')`,
    );
  });
  for (const [origin, price] of [
    ['SIN', 41_000],
    ['KUL', 45_500],
  ] as const) {
    await seedFareCell(harness.pool, {
      origin,
      dest: 'KIX',
      destinationId: kyoto,
      month: monthAhead(2),
      priceMinor: price,
      fetchedAt: new Date(Date.now() - 3_600_000),
    });
  }
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function insights(ref: string, query: string): Promise<DestinationInsights> {
  const me = await harness.signInAnonymously();
  const response = await harness.request(`/v1/destinations/${ref}?${query}`, {
    headers: { cookie: me.cookie },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as DestinationInsights;
}

describe('GET /v1/destinations/{id}', () => {
  it("serves Kyoto's reviewed curve with its spring and autumn highlights, each row sourced", async () => {
    const body = await insights(
      destinations['kyoto'] ?? '',
      `origins=SIN,KUL&month=${monthAhead(2)}`,
    );
    expect(body.curve).toHaveLength(12);
    for (const row of body.curve ?? []) {
      expect(row.source.length).toBeGreaterThan(0);
      expect(row.reviewed_at).not.toBeNull();
    }
    const tagged = new Map(body.highlights.map((h) => [h.month, h.tag]));
    expect(tagged.get(4)).toMatch(/APR/);
    expect(tagged.get(11)).toMatch(/NOV/);
    const byMonth = new Map((body.curve ?? []).map((row) => [row.month, row]));
    expect(byMonth.get(4)?.colour_role).toBe('peak');
    expect(byMonth.get(11)?.colour_role).toBe('peak');
    expect(body.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(['blossom', 'foliage']),
    );
  });

  it('re-prices the page for the requested airports and month', async () => {
    const body = await insights('kyoto', `origins=SIN,KUL,BKK&month=${monthAhead(2)}`);
    expect(body.fares.map((fare) => [fare.origin, fare.state, fare.price_minor])).toEqual([
      ['SIN', 'ok', 41_000],
      ['KUL', 'ok', 45_500],
      ['BKK', 'missing', null],
    ]);
    expect(body.fares[0]?.fastest_duration_min).toBe(165);
    const other = await insights('kyoto', `origins=SIN&month=${monthAhead(3)}`);
    expect(other.fares).toEqual([expect.objectContaining({ origin: 'SIN', state: 'missing' })]);
  });

  it('carries an FX chip in round local units from the stored snapshots', async () => {
    const body = await insights('kyoto', 'origins=SIN&currency=USD');
    expect(body.fx).toMatchObject({
      from: { amount_minor: 1000, currency: 'JPY' },
      to: { amount_minor: 671, currency: 'USD' },
      source: 'frankfurter',
      stale: false,
    });
  });

  it('answers curve null with best months when no reviewed curve exists', async () => {
    const body = await insights('bali', 'origins=SIN');
    expect(body.curve).toBeNull();
    expect(body.highlights).toEqual([]);
    expect(body.best_months).toEqual([3, 4, 10, 11]);
  });

  it('hides an edited curve again until it is re-approved', async () => {
    const kyoto = destinations['kyoto'] ?? '';
    const april = kyotoSeed.months.find((month) => month.month === 4);
    if (april === undefined) throw new Error('kyoto seed has no April');
    await withSystem(harness.pool, (tx) =>
      handleUpsertSeasonEditorial(tx, CONTENT, {
        destination_id: kyoto,
        months: [{ ...april, crowd_index: 99 }],
        events: [],
      }),
    );
    const body = await insights('kyoto', 'origins=SIN');
    expect(body.curve?.map((row) => row.month)).not.toContain(4);
    const audits = await harness.pool.query(
      "SELECT count(*)::int AS n FROM ops.admin_audit WHERE action = 'upsert_season_editorial'",
    );
    expect(audits.rows[0]).toEqual({ n: 2 });
  });
});

describe('upsert_season_editorial', () => {
  it('is content-role only', async () => {
    await expect(
      withSystem(harness.pool, (tx) =>
        handleUpsertSeasonEditorial(
          tx,
          { ...CONTENT, roles: ['support'] },
          { destination_id: destinations['bali'] ?? '', months: [], events: [] },
        ),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('fx tool', () => {
  it('converts at the stored snapshot rate and refuses a pair no snapshot relates', async () => {
    const registry = createToolRegistry();
    registerTravelDataToolExecutors(registry, harness.pool);
    const me = await harness.signInAnonymously();
    const context = { uid: me.uid, tripId: null, caller: 'C', route: 'guide.chat' } as const;
    const converted = await registry.execute(
      { id: 'f1', name: 'fx', input: { amount_minor: 1000, from: 'JPY', to: 'USD' } },
      context,
    );
    expect(converted).toMatchObject({ ok: true, output: { amount_minor: 671 } });
    const missing = await registry.execute(
      { id: 'f2', name: 'fx', input: { amount_minor: 1000, from: 'JPY', to: 'PEN' } },
      context,
    );
    expect(missing).toMatchObject({ ok: false, failure: 'TOOL_UNAVAILABLE' });
  });
});
