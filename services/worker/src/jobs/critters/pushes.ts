/**
 * Critter pushes: N-15 when a traveller's egg hatches (to them, naming their new critter and the
 * place), N-49 in the evening roundup when a crewmate befriends one (named only to crewmates who
 * have found that critter themselves, "a new local" to everyone else, nothing at all when the finder
 * hides their collection), and N-30 a month before a legendary window (the place line, never the
 * unfound legendary's name). The trip's guide speaks when there is one.
 */
import { CRITTER_PUSH } from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type NotificationSender } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, firstName, str } from '../setup/facts';

async function tripGuide(tx: pg.PoolClient, tripId: string | null): Promise<NotificationSender> {
  if (tripId === null) return DEFAULT_SETUP_GUIDE;
  const { rows } = await tx.query<{ slug: string; name: string }>(
    'SELECT g.slug, g.name FROM trips t JOIN guides g ON g.id = t.guide_id WHERE t.id = $1',
    [tripId],
  );
  const guide = rows[0];
  return guide === undefined
    ? DEFAULT_SETUP_GUIDE
    : { kind: 'guide', id: guide.slug, name: guide.name };
}

async function place(tx: pg.PoolClient, tripId: string | null): Promise<string> {
  const { rows } = await tx.query<{ name: string }>(
    'SELECT d.name FROM trips t JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1',
    [tripId],
  );
  return rows[0]?.name ?? 'your trip';
}

async function ownedCritterName(
  tx: pg.PoolClient,
  uid: string,
  critterId: string | null,
): Promise<string | null> {
  const { rows } = await tx.query<{ name: string | null }>(
    `SELECT critter_name AS name FROM collection_entries
      WHERE user_id = $1 AND critter_id = $2 AND verification = 'verified' AND critter_name IS NOT NULL
      LIMIT 1`,
    [uid, critterId],
  );
  return rows[0]?.name ?? null;
}

let registered = false;

export function registerCritterPushes(): void {
  if (registered) return;
  registered = true;
  registerNotification({
    key: 'landed_egg_hatch',
    event: 'egg.hatched',
    audience: (_tx, event) => Promise.resolve([str(event, 'user_id')].filter((u) => u !== null)),
    async compose(tx, event, uid) {
      const { rows } = await tx.query<{ critter_id: string }>(
        'SELECT critter_id FROM critter_forms WHERE id = $1',
        [str(event, 'form_id')],
      );
      const critter = await ownedCritterName(tx, uid, rows[0]?.critter_id ?? null);
      if (critter === null) return null;
      return {
        title: CRITTER_PUSH.hatchedTitle,
        body: CRITTER_PUSH.hatchedBody,
        vars: { place: await place(tx, event.tripId), critter },
        sender: await tripGuide(tx, event.tripId),
        tripId: event.tripId,
        deepLink: '/pass',
      };
    },
  });
  registerNotification({
    key: 'crewmate_befriended',
    event: 'critter.befriended',
    async audience(tx, event) {
      const finder = str(event, 'user_id');
      if (event.crewId === null || finder === null) return [];
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT m.user_id FROM crew_members m
          WHERE m.crew_id = $1 AND m.status = 'active' AND m.user_id <> $2
            AND NOT coalesce((SELECT hide_collection FROM user_settings WHERE user_id = $2), false)
          ORDER BY m.user_id`,
        [event.crewId, finder],
      );
      return rows.map((row) => row.user_id);
    },
    async compose(tx, event, uid) {
      const finder = str(event, 'user_id');
      if (finder === null) return null;
      const critter = await ownedCritterName(tx, uid, str(event, 'critter_id'));
      return {
        title: CRITTER_PUSH.befriendedTitle,
        body: critter === null ? CRITTER_PUSH.befriendedUnnamed : CRITTER_PUSH.befriendedNamed,
        vars: {
          member: await firstName(tx, finder),
          place: await place(tx, event.tripId),
          ...(critter === null ? {} : { critter }),
        },
        sender: await tripGuide(tx, event.tripId),
        crewId: event.crewId,
        tripId: event.tripId,
        deepLink: '/pass',
      };
    },
  });
  registerNotification({
    key: 'critter_window_reminder',
    event: 'legendary.reminder_due',
    audience: (_tx, event) => Promise.resolve([str(event, 'user_id')].filter((u) => u !== null)),
    async compose(tx, event) {
      const { rows } = await tx.query<{ place_line: string }>(
        'SELECT place_line FROM legendary_windows WHERE id = $1',
        [str(event, 'window_id')],
      );
      const line = rows[0]?.place_line;
      if (line === undefined) return null;
      return {
        title: CRITTER_PUSH.legendaryTitle,
        body: CRITTER_PUSH.legendaryBody,
        vars: { place: line },
        sender: DEFAULT_SETUP_GUIDE,
        deepLink: '/critters/legendaries',
      };
    },
  });
}
