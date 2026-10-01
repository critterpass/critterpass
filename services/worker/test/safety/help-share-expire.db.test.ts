/**
 * `help.share_expire` against a migrated Postgres, on a pinned clock: a Help share left alone ends
 * by itself one hour after it opened (the session closes, the sharer's app hears it, the expiry is
 * recorded, the fixes go), exactly once; before its end, after an extend or after a manual stop
 * the job changes nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expireHelpShare } from '../../src/jobs/safety/help-share-expire';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';
import { addFix, buildCrewTrip, type CrewTrip } from '../live-map/live-map-fixture';

let harness: JobsHarness;
let trip: CrewTrip;
const HOUR = 3_600_000;

async function openHelpShare(
  uid: string,
  opened: Date,
): Promise<{ share: string; session: string }> {
  const share = await harness.pool.query<{ id: string }>(
    `INSERT INTO location_shares (trip_id, user_id, reason, starts_at, ends_at)
     VALUES ($1, $2, 'help', $3, $4) RETURNING id`,
    [trip.tripId, uid, opened, new Date(opened.getTime() + HOUR)],
  );
  const session = await harness.pool.query<{ id: string }>(
    `INSERT INTO help_sessions (trip_id, user_id, kind, share_id, opened_at)
     VALUES ($1, $2, 'help', $3, $4) RETURNING id`,
    [trip.tripId, uid, share.rows[0]!.id, opened],
  );
  return { share: share.rows[0]!.id, session: session.rows[0]!.id };
}

beforeAll(async () => {
  harness = await startJobsHarness();
  trip = await buildCrewTrip(harness.pool);
}, 240_000);

afterAll(async () => {
  await harness.close();
});

describe('expireHelpShare', () => {
  it('ends a Help share one hour after it opened, once', async () => {
    const opened = new Date();
    const [maya] = trip.uids;
    const { share, session } = await openHelpShare(maya, opened);
    await addFix(harness.pool, share, { lat: -8.5, lng: 115.26, at: opened });

    const early = await expireHelpShare(harness.pool, share, new Date(opened.getTime() + HOUR / 2));
    expect(early).toEqual({ expired: false, purged: 0 });

    const due = new Date(opened.getTime() + HOUR + 1000);
    expect(await expireHelpShare(harness.pool, share, due)).toEqual({ expired: true, purged: 1 });
    const row = await harness.pool.query<{ status: string; resolved_at: Date }>(
      'SELECT status, resolved_at FROM help_sessions WHERE id = $1',
      [session],
    );
    expect(row.rows[0]?.status).toBe('resolved');
    expect(row.rows[0]?.resolved_at.getTime()).toBe(opened.getTime() + HOUR);
    const hint = await harness.pool.query<{ type: string }>(
      "SELECT payload->>'type' AS type FROM rt_outbox WHERE channel = $1",
      [`user:#${maya}`],
    );
    expect(hint.rows.map((r) => r.type)).toEqual(['help.share_ended']);
    const events = await harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'help_share.expired' AND aggregate_id = $1",
      [session],
    );
    expect(events.rowCount).toBe(1);

    expect(await expireHelpShare(harness.pool, share, due)).toEqual({ expired: false, purged: 0 });
    const again = await harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'help_share.expired' AND aggregate_id = $1",
      [session],
    );
    expect(again.rowCount).toBe(1);
  });

  it('leaves an extended share running and a stopped one quiet', async () => {
    const [, rin, jordan] = trip.uids;
    const opened = new Date();
    const extended = await openHelpShare(rin, opened);
    await harness.pool.query(
      "UPDATE location_shares SET ends_at = ends_at + interval '1 hour' WHERE id = $1",
      [extended.share],
    );
    const firstDue = new Date(opened.getTime() + HOUR + 1000);
    expect(await expireHelpShare(harness.pool, extended.share, firstDue)).toEqual({
      expired: false,
      purged: 0,
    });

    const stopped = await openHelpShare(jordan, opened);
    await harness.pool.query(
      `UPDATE help_sessions SET status = 'resolved', resolved_at = now() WHERE id = $1`,
      [stopped.session],
    );
    await harness.pool.query('UPDATE location_shares SET ends_at = now() WHERE id = $1', [
      stopped.share,
    ]);
    const result = await expireHelpShare(harness.pool, stopped.share, firstDue);
    expect(result.expired).toBe(false);
  });
});
