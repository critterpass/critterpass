/**
 * `assign_provider` ops in `app.apply_change_set`: an approved change set sets its driver on the
 * days it names (the voted terms, or his shortlisted terms without any), replaces a driver set on
 * a day meanwhile, skips a pick the reviewer turned off, carries the plan's items over untouched,
 * and refuses a provider that is not a driver of the trip. Voted terms become the driver's terms
 * on the comparison; a pick a driver's link proposed is set by the member who made the link (an
 * organiser when that member is gone). Members cannot call the writer itself.
 */
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../src/tx';
import { anonymousActor } from './helpers/actors';
import { insertChangeSet } from './helpers/plan-actors';
import { buildPlanFixture, type PlanFixture } from './helpers/plan-fixture';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from './helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const TERMS = {
  price_minor: 70000000,
  currency: 'IDR',
  price_unit: 'day',
  included_hours: 10,
  includes: { fuel: 'yes' },
  overtime_minor: null,
};

const day = (date: string, end = '18:00') => ({
  date,
  window_start: '06:30',
  window_end: end,
  pickup: 'Villa gate',
});

const pick = (
  providerId: string,
  days: readonly unknown[],
  extra: { readonly terms?: typeof TERMS; readonly accepted?: boolean } = {},
) => ({
  op: 'assign_provider',
  target: providerId,
  assignment: { days, ...(extra.terms === undefined ? {} : { terms: extra.terms }) },
  reason: 'our driver',
  affected_user_ids: [],
  booking_impact: false,
  ...(extra.accepted === undefined ? {} : { accepted: extra.accepted }),
});

async function driver(tripId: string, name: string, kind = 'driver'): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>(
    'INSERT INTO providers (trip_id, kind, name) VALUES ($1, $2, $3) RETURNING id',
    [tripId, kind, name],
  );
  return rows[0]?.id as string;
}

async function approvedSet(fx: PlanFixture, ops: readonly unknown[]): Promise<string> {
  const id = await insertChangeSet(db.pool, {
    tripId: fx.tripId,
    baseVersionId: fx.versionId,
    authorId: fx.memberId,
    ops,
  });
  await withUser(db.pool, fx.memberId, anonymousActor().device, async (tx) => {
    await tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [id]);
  });
  await withUser(db.pool, fx.organiserId, anonymousActor().device, async (tx) => {
    await tx.query("UPDATE change_sets SET status = 'approved' WHERE id = $1", [id]);
  });
  return id;
}

const apply = (fx: PlanFixture, id: string): Promise<string | null> =>
  withUser(db.pool, fx.organiserId, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<{ v: string | null }>(
      'SELECT app.apply_change_set($1)::text AS v',
      [id],
    );
    return rows[0]?.v ?? null;
  });

interface AssignmentRow {
  readonly date: string;
  readonly provider_id: string;
  readonly window_end: string | null;
  readonly agreed: unknown;
  readonly change_set_id: string | null;
  readonly assigned_by: string;
}

const assignments = (tripId: string): Promise<AssignmentRow[]> =>
  withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<AssignmentRow>(
      `SELECT to_char(day_date, 'YYYY-MM-DD') AS date, provider_id, window_end, agreed,
              change_set_id, assigned_by
         FROM provider_assignments WHERE trip_id = $1 ORDER BY day_date`,
      [tripId],
    );
    return rows;
  });

describe('app.apply_change_set with a driver pick', () => {
  it('sets the driver on his days, replaces the one set meanwhile, and keeps the plan items', async () => {
    const fx = await buildPlanFixture(db.pool);
    const made = await driver(fx.tripId, 'Made');
    const komang = await driver(fx.tripId, 'Komang');
    await withSystem(db.pool, async (tx) => {
      await tx.query(
        `INSERT INTO provider_terms (provider_id, trip_id, source, price_minor, currency, price_unit)
         VALUES ($1, $2, 'found', 65000000, 'IDR', 'day')`,
        [komang, fx.tripId],
      );
      // Set directly while the crew was voting: the vote decides after it.
      await tx.query(
        `INSERT INTO provider_assignments (trip_id, day_date, provider_id, assigned_by)
         VALUES ($1, '2027-02-02', $2, $3)`,
        [fx.tripId, komang, fx.organiserId],
      );
    });
    const id = await approvedSet(fx, [
      pick(made, [day('2027-02-01'), day('2027-02-02', '21:30')], { terms: TERMS }),
      pick(komang, [day('2027-02-03')]),
      pick(komang, [day('2027-02-04')], { accepted: false }),
    ]);

    const versionId = await apply(fx, id);
    expect(versionId).not.toBeNull();

    const shortlisted = {
      price_minor: 65000000,
      currency: 'IDR',
      price_unit: 'day',
      included_hours: null,
      includes: {},
      overtime_minor: null,
    };
    const by = { change_set_id: id, assigned_by: fx.memberId };
    expect(await assignments(fx.tripId)).toEqual([
      { date: '2027-02-01', provider_id: made, window_end: '18:00', agreed: TERMS, ...by },
      { date: '2027-02-02', provider_id: made, window_end: '21:30', agreed: TERMS, ...by },
      { date: '2027-02-03', provider_id: komang, window_end: '18:00', agreed: shortlisted, ...by },
    ]);
    const items = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ stable_id: string }>(
        'SELECT stable_id FROM plan_items WHERE version_id = $1 ORDER BY stable_id',
        [versionId],
      );
      return rows.map((row) => row.stable_id);
    });
    expect(items).toEqual(fx.items.map((item) => item.stableId).sort());
  });

  it('refuses a provider that is not a driver of the trip, writing nothing', async () => {
    const fx = await buildPlanFixture(db.pool);
    const other = await buildPlanFixture(db.pool);
    const theirs = await driver(other.tripId, 'Wayan');
    const stay = await driver(fx.tripId, 'Villa', 'stay');
    for (const providerId of [theirs, stay]) {
      const id = await approvedSet(fx, [pick(providerId, [day('2027-02-01')])]);
      await expect(apply(fx, id)).rejects.toThrow(/not a driver of trip/);
    }
    expect(await assignments(fx.tripId)).toEqual([]);
    const { rows } = await db.pool.query<{ current_version_id: string }>(
      'SELECT current_version_id FROM trips WHERE id = $1',
      [fx.tripId],
    );
    expect(rows[0]?.current_version_id).toBe(fx.versionId);
  });

  it("makes the voted terms the driver's terms, and leaves a pick without terms alone", async () => {
    const fx = await buildPlanFixture(db.pool);
    const made = await driver(fx.tripId, 'Made');
    const komang = await driver(fx.tripId, 'Komang');
    await withSystem(db.pool, async (tx) => {
      await tx.query(
        `INSERT INTO provider_terms (provider_id, trip_id, source, price_minor, currency,
           price_unit, includes, overtime_minor, car)
         SELECT id, $1, 'found', 65000000, 'IDR', 'day', '{"tolls":"no"}', 7500000, 'Avanza'
           FROM providers WHERE id = ANY($2::uuid[])`,
        [fx.tripId, [made, komang]],
      );
    });
    const id = await approvedSet(fx, [
      pick(made, [day('2027-02-01')], { terms: TERMS }),
      pick(komang, [day('2027-02-02')]),
    ]);
    expect(await apply(fx, id)).not.toBeNull();

    const terms = await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT provider_id, price_minor::int AS price_minor, currency::text AS currency,
                price_unit, included_hours::float AS included_hours, includes,
                overtime_minor::int AS overtime_minor, car
           FROM provider_terms WHERE trip_id = $1`,
        [fx.tripId],
      );
      return new Map(rows.map((row) => [row.provider_id, row]));
    });
    // What the vote did not cover (his car) stays as shortlisted.
    expect(terms.get(made)).toEqual({ provider_id: made, ...TERMS, car: 'Avanza' });
    expect(terms.get(komang)).toMatchObject({
      price_minor: 65000000,
      includes: { tolls: 'no' },
      overtime_minor: 7500000,
    });
  });

  it("sets a pick a driver's link proposed by the member who made the link", async () => {
    const fx = await buildPlanFixture(db.pool);
    const made = await driver(fx.tripId, 'Made');
    const fromLink = async (createdBy: string | null, date: string): Promise<string> => {
      const id = await withSystem(db.pool, async (tx) => {
        const share = await tx.query<{ id: string }>(
          `INSERT INTO driver_plan_shares (trip_id, provider_id, driver_name, created_by,
             itinerary_version_id, day_nos, token_hash, token_enc, expires_at, revoked_at)
           VALUES ($1, $2, 'Made', $3, $4, '{1}', $5, 'sealed', now() + interval '14 days', now())
           RETURNING id`,
          [fx.tripId, made, createdBy, fx.versionId, randomBytes(32)],
        );
        const base = await tx.query<{ id: string }>(
          'SELECT current_version_id AS id FROM trips WHERE id = $1',
          [fx.tripId],
        );
        const set = await tx.query<{ id: string }>(
          `INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, ops)
           VALUES ($1, $2, 'driver', 'provider', $3, $4) RETURNING id`,
          [
            fx.tripId,
            base.rows[0]?.id,
            share.rows[0]?.id,
            JSON.stringify([pick(made, [day(date)], { terms: TERMS })]),
          ],
        );
        const setId = set.rows[0]?.id as string;
        // The crew's vote passed: no one person approved it.
        await tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [setId]);
        await tx.query("UPDATE change_sets SET status = 'approved' WHERE id = $1", [setId]);
        return setId;
      });
      expect(await apply(fx, id)).not.toBeNull();
      return id;
    };

    const byMember = await fromLink(fx.memberId, '2027-02-01');
    const orphaned = await fromLink(null, '2027-02-02');

    expect(await assignments(fx.tripId)).toMatchObject([
      { date: '2027-02-01', change_set_id: byMember, assigned_by: fx.memberId, agreed: TERMS },
      { date: '2027-02-02', change_set_id: orphaned, assigned_by: fx.organiserId },
    ]);
  });

  it('keeps the writer itself from members', async () => {
    const fx = await buildPlanFixture(db.pool);
    const made = await driver(fx.tripId, 'Made');
    const id = await approvedSet(fx, [pick(made, [day('2027-02-01')])]);
    await expect(
      withUser(db.pool, fx.organiserId, anonymousActor().device, (tx) =>
        tx.query('SELECT app.apply_provider_assignments($1)', [id]),
      ),
    ).rejects.toThrow(/permission denied/);
    expect(await assignments(fx.tripId)).toEqual([]);
  });
});
