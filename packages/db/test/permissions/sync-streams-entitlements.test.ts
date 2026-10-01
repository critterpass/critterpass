import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import {
  idsByTable,
  startStreamHarness,
  STREAM_ACTORS,
  totalRows,
  type StreamHarness,
} from '../helpers/stream-harness';

let harness: StreamHarness;
const fx = { sgd: '', jpy: '', thb: '', krw: '', idr: '', usd: '' };

async function insertRate(quote: string, base = 'USD'): Promise<string> {
  const { rows } = await harness.db.pool.query<{ id: string }>(
    `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
     VALUES ($2, $1, 1.5, '2026-09-26', 'stream-test') RETURNING id`,
    [quote, base],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  harness = await startStreamHarness();
  const { fixture } = harness;
  // usage_counters is writable by app_owner only (quota functions); the owner pool seeds it here.
  await harness.db.pool.query(
    `INSERT INTO usage_counters (subject_kind, subject_id, metric, period_key, limit_at_time, reset_at)
     VALUES ('user', $1, 'guide_answers', 'stream-test', 20, now() + interval '1 day')`,
    [fixture.actors.member],
  );
  await withSystem(harness.db.pool, async (tx) => {
    await tx.query("UPDATE trips SET local_currency = 'THB' WHERE id = $1", [fixture.tripId]);
    await tx.query("UPDATE crews SET settlement_currency = 'SGD' WHERE id = $1", [fixture.crewId]);
    // A second crew trip with no local currency of its own: its destination's currency stands in.
    const { rows: place } = await tx.query<{ id: string }>(
      `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
       VALUES ('stream-test-bali', 'Bali', 'Indonesia', 'live', 'IDR', 'Asia/Makassar') RETURNING id`,
    );
    await tx.query(
      "INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'voting', $2)",
      [fixture.crewId, place[0]?.id],
    );
    await tx.query("UPDATE users SET home_currency = 'JPY' WHERE id = $1", [fixture.actors.member]);
    await tx.query("UPDATE users SET home_currency = 'KRW' WHERE id = $1", [
      fixture.actors.outsider,
    ]);
  });
  fx.sgd = await insertRate('SGD');
  fx.jpy = await insertRate('JPY');
  fx.thb = await insertRate('THB');
  fx.krw = await insertRate('KRW');
  fx.idr = await insertRate('IDR');
  fx.usd = await insertRate('USD', 'EUR');
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('entitlements in the me stream', () => {
  it("syncs the organiser's own entitlements only", async () => {
    const { actors } = harness.fixture;
    expect(idsByTable(await harness.rows('me', 'organiser'))['user_entitlements']).toEqual([
      actors.organiser,
    ]);
    expect(idsByTable(await harness.rows('me', 'member'))['user_entitlements']).toEqual([]);
  });

  it('syncs user-scoped usage counters to their owner only', async () => {
    const member = await harness.rows('me', 'member');
    expect(member.get('usage_counters')).toEqual([
      expect.objectContaining({ subject_kind: 'user', subject_id: harness.fixture.actors.member }),
    ]);
    expect(idsByTable(await harness.rows('me', 'organiser'))['usage_counters']).toEqual([]);
  });
});

describe('entitlements in the trip stream', () => {
  const params = (): Record<string, string> => ({ trip_id: harness.fixture.tripId });

  it.each(['member', 'organiser'] as const)(
    'syncs trip entitlements and trip meters to %s',
    async (actor) => {
      const rows = await harness.rows('trip', actor, params());
      expect(idsByTable(rows)['trip_entitlements']).toEqual([harness.fixture.tripId]);
      expect(rows.get('usage_counters')).toEqual([
        expect.objectContaining({ subject_kind: 'trip', subject_id: harness.fixture.tripId }),
      ]);
    },
  );

  it.each(['outsider', 'exMember', 'anonymous'] as const)(
    'syncs zero rows to %s',
    async (actor) => {
      expect(totalRows(await harness.rows('trip', actor, params()))).toBe(0);
    },
  );
});

describe('products and perks in the catalog stream', () => {
  it.each(STREAM_ACTORS)('syncs every product and perk to %s', async (actor) => {
    const ids = idsByTable(await harness.rows('catalog', actor));
    expect(ids['products']).toContain('boost_trip');
    expect(ids['perks']).toContain('boost_live_map');
  });
});

describe('fx stream', () => {
  it("syncs the member's home, settlement and trip currencies, and the dollar they are priced in", async () => {
    const ids = idsByTable(await harness.rows('fx', 'member'));
    // The permission fixture's own EUR→SGD row is a settlement-currency rate too.
    expect(ids['fx_snapshots']).toEqual(
      expect.arrayContaining([fx.jpy, fx.sgd, fx.thb, fx.idr, fx.usd]),
    );
    expect(ids['fx_snapshots']).not.toContain(fx.krw);
  });

  it("syncs a trip's destination currency when the trip has none of its own", async () => {
    const organiser = idsByTable(await harness.rows('fx', 'organiser'))['fx_snapshots'];
    expect(organiser).toContain(fx.idr);
    const outsider = idsByTable(await harness.rows('fx', 'outsider'))['fx_snapshots'];
    expect(outsider).not.toContain(fx.idr);
  });

  it("syncs only an outsider's own home currency and the dollar rate", async () => {
    const ids = idsByTable(await harness.rows('fx', 'outsider'))['fx_snapshots'];
    expect([...(ids ?? [])].sort()).toEqual([fx.krw, fx.usd].sort());
  });

  it('syncs nothing crew-derived to an ex-member or an anonymous uid', async () => {
    for (const actor of ['exMember', 'anonymous'] as const) {
      expect(idsByTable(await harness.rows('fx', actor))['fx_snapshots']).toEqual([fx.usd]);
    }
  });
});
