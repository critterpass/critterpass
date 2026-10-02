/**
 * `help.share_ending` against a migrated Postgres: ten minutes before a Help share ends its sharer
 * is reminded, once, with a push that never says Help and that only they can act on; a share
 * extended, stopped or already over since the reminder was armed stays quiet.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getRegistration, type RoutedEvent } from '../../src/jobs/notify/register';
import { remindHelpShareEnding } from '../../src/jobs/safety/help-share-ending';
import { registerSafetyNotifications } from '../../src/jobs/safety/notify';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';
import { buildCrewTrip, type CrewTrip } from '../live-map/live-map-fixture';

let harness: JobsHarness;
let trip: CrewTrip;
const MINUTE = 60_000;

async function openHelpShare(
  uid: string,
  endsAt: Date,
): Promise<{ share: string; session: string }> {
  const share = await harness.pool.query<{ id: string }>(
    `INSERT INTO location_shares (trip_id, user_id, reason, starts_at, ends_at)
     VALUES ($1, $2, 'help', $3, $4) RETURNING id`,
    [trip.tripId, uid, new Date(endsAt.getTime() - 60 * MINUTE), endsAt],
  );
  const session = await harness.pool.query<{ id: string }>(
    `INSERT INTO help_sessions (trip_id, user_id, kind, share_id) VALUES ($1, $2, 'help', $3)
     RETURNING id`,
    [trip.tripId, uid, share.rows[0]!.id],
  );
  return { share: share.rows[0]!.id, session: session.rows[0]!.id };
}

async function endingEvents(share: string) {
  const { rows } = await harness.pool.query<RoutedEvent & { payload: Record<string, unknown> }>(
    `SELECT id, type, payload, crew_id AS "crewId", trip_id AS "tripId", actor_id AS "actorId",
            occurred_at AS "occurredAt"
       FROM domain_events WHERE type = 'help_share.ending' AND payload->>'share_id' = $1`,
    [share],
  );
  return rows;
}

beforeAll(async () => {
  harness = await startJobsHarness();
  trip = await buildCrewTrip(harness.pool);
  registerSafetyNotifications();
}, 240_000);

afterAll(async () => {
  await harness.close();
});

describe('remindHelpShareEnding', () => {
  it('reminds the sharer once, ten minutes before the end', async () => {
    const [maya, rin] = trip.uids;
    const endsAt = new Date(Date.now() + 10 * MINUTE);
    const { share } = await openHelpShare(maya, endsAt);

    expect(await remindHelpShareEnding(harness.pool, share, endsAt.toISOString())).toEqual({
      reminded: true,
    });
    expect(await remindHelpShareEnding(harness.pool, share, endsAt.toISOString())).toEqual({
      reminded: false,
    });
    const events = await endingEvents(share);
    expect(events).toHaveLength(1);

    const registration = getRegistration('help_share.ending', 'location_share_ending');
    expect(registration).toBeDefined();
    const event = events[0]!;
    const { audience, push } = await withSystem(harness.pool, async (tx) => ({
      audience: await registration!.audience(tx, event),
      push: await registration!.compose(tx, event, maya),
    }));
    expect(audience).toEqual([maya]);
    expect(audience).not.toContain(rin);
    expect(push?.ctx).toMatchObject({ share_id: share, sharer_id: maya });
    const words = JSON.stringify([push?.title, push?.body]).toLowerCase();
    expect(words).not.toMatch(/help|sos|health/u);
  });

  it('stays quiet for a share extended, stopped or over since it was armed', async () => {
    const [maya, rin, jordan] = trip.uids;
    const endsAt = new Date(Date.now() + 10 * MINUTE);

    const extended = await openHelpShare(rin, new Date(endsAt.getTime() + 60 * MINUTE));
    expect(await remindHelpShareEnding(harness.pool, extended.share, endsAt.toISOString())).toEqual(
      {
        reminded: false,
      },
    );

    const stopped = await openHelpShare(jordan, endsAt);
    await harness.pool.query(
      "UPDATE help_sessions SET status = 'resolved', resolved_at = now() WHERE id = $1",
      [stopped.session],
    );
    expect(await remindHelpShareEnding(harness.pool, stopped.share, endsAt.toISOString())).toEqual({
      reminded: false,
    });

    const past = new Date(Date.now() - MINUTE);
    const over = await openHelpShare(maya, past);
    expect(await remindHelpShareEnding(harness.pool, over.share, past.toISOString())).toEqual({
      reminded: false,
    });
    for (const id of [extended.share, stopped.share, over.share]) {
      expect(await endingEvents(id)).toHaveLength(0);
    }
  });
});
