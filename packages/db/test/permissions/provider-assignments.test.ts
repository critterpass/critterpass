/**
 * Finding a driver: a driver's quoted terms and the days he is set on are read by the trip's crew
 * only (and synced to them for the offline ride-back card); a member's NOT NOW on a day is theirs
 * alone; a shared driver message, which carries a third party's phone number, is never readable
 * through app_user, guide_reader or sync.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import { expectCrewReadOnly, expectSealed, visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';
import { FIXTURE_PROVIDER_NAME } from '../helpers/suppliers-fixture';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { actors, tripId } = harness.fixture;
  await withSystem(harness.db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'SELECT id FROM providers WHERE trip_id = $1 AND name = $2',
      [tripId, FIXTURE_PROVIDER_NAME],
    );
    const providerId = rows[0]?.id;
    await tx.query(
      `INSERT INTO provider_terms (provider_id, trip_id, source, languages, price_minor, currency,
         price_unit, included_hours, includes, confirmed_fields)
       VALUES ($1, $2, 'found', '{en,id}', 65000000, 'IDR', 'day', 10,
         '{"fuel":"yes","tolls":"unknown"}', '{phone,price}')`,
      [providerId, tripId],
    );
    await tx.query(
      `INSERT INTO provider_assignments (trip_id, day_date, provider_id, window_start, window_end,
         assigned_by)
       VALUES ($1, '2026-10-14', $2, '06:30', '18:00', $3)`,
      [tripId, providerId, actors.organiser],
    );
    await tx.query(
      `INSERT INTO provider_intake (trip_id, shared_by, kind, raw_text)
       VALUES ($1, $2, 'text', 'Made here, WA +62 812 3456 7890')`,
      [tripId, actors.member],
    );
    await tx.query(
      `INSERT INTO pickup_gap_dismissals (trip_id, user_id, day_date) VALUES ($1, $2, '2026-10-14')`,
      [tripId, actors.member],
    );
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('driver shortlist and intake', () => {
  it('terms and day assignments are read by the crew of the trip only', async () => {
    await expectCrewReadOnly(harness, 'provider_terms');
    await expectCrewReadOnly(harness, 'provider_assignments');
  });

  it('allows one driver per trip day', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO provider_assignments (trip_id, day_date, provider_id, assigned_by)
           SELECT trip_id, day_date, provider_id, $2 FROM provider_assignments WHERE trip_id = $1`,
          [tripId, actors.organiser],
        ),
      ),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('a NOT NOW is read and synced to the member who tapped it only', async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM pickup_gap_dismissals WHERE trip_id = $1';
    expect(await visibleRows(harness, actors.member, probe, [tripId])).toBe(1);
    for (const kind of ['organiser', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
    const mine = await harness.rows('trip_me', 'member', { trip_id: tripId });
    expect(mine.get('pickup_gap_dismissals')).toHaveLength(1);
    const theirs = await harness.rows('trip_me', 'organiser', { trip_id: tripId });
    expect(theirs.get('pickup_gap_dismissals') ?? []).toHaveLength(0);
  });

  it('a shared driver message is never readable through app_user, guide_reader or sync', async () => {
    await expectSealed(harness, 'provider_intake', { owner: null });
  });
});
