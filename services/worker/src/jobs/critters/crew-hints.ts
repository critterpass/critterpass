/**
 * Announcing a verified find: one `critter.befriended` event (N-49 to the crew, the quest and
 * reward consumers) and, on each active crew's `crew_collection:{crew_id}` channel, a
 * `critter.befriended` hint plus `first_spotter` when nobody else in that crew had the critter.
 * A member hiding their collection gets the event (their own rewards still run) but no crew hint.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import { channelName, CRITTERS_RT } from '@cp/domain';
import type pg from 'pg';

import type { GrantedEntry } from '../rewards/registry';

interface CrewRow {
  readonly crew_id: string;
  readonly first: boolean;
}

export async function announceFind(tx: pg.PoolClient, entry: GrantedEntry): Promise<void> {
  const { rows: settings } = await tx.query<{ hidden: boolean }>(
    'SELECT coalesce((SELECT hide_collection FROM user_settings WHERE user_id = $1), false) AS hidden',
    [entry.user_id],
  );
  const hidden = settings[0]?.hidden === true;
  const { rows: crews } = await tx.query<CrewRow>(
    `SELECT m.crew_id, NOT EXISTS (
         SELECT 1 FROM collection_entries c JOIN crew_members o ON o.user_id = c.user_id
          WHERE o.crew_id = m.crew_id AND o.status = 'active' AND c.user_id <> $1
            AND c.critter_id = $2 AND c.verification = 'verified'
       ) AS first
       FROM crew_members m WHERE m.user_id = $1 AND m.status = 'active'
      ORDER BY m.crew_id`,
    [entry.user_id, entry.critter_id],
  );
  const { rows: trip } = await tx.query<{ crew_id: string }>(
    'SELECT crew_id FROM trips WHERE id = $1',
    [entry.trip_id],
  );
  const tripCrew = trip[0]?.crew_id ?? null;
  const eventCrew = crews.find((crew) => crew.crew_id === tripCrew) ?? crews[0];
  await appendDomainEvent(tx, {
    type: 'critter.befriended',
    aggregateKind: 'collection_entry',
    aggregateId: entry.id,
    actorKind: 'user',
    actorId: entry.user_id,
    crewId: eventCrew?.crew_id ?? null,
    tripId: entry.trip_id,
    payload: {
      trip_id: entry.trip_id,
      user_id: entry.user_id,
      entry_id: entry.id,
      form_id: entry.form_id,
      critter_id: entry.critter_id,
      source: entry.source,
      first_in_crew: eventCrew?.first ?? false,
    },
  });
  if (hidden) return;
  const hint = {
    user_id: entry.user_id,
    form_id: entry.form_id,
    critter_id: entry.critter_id,
    entry_id: entry.id,
  };
  for (const crew of crews) {
    const channel = channelName('crew_collection', crew.crew_id);
    await outbox(tx, channel, CRITTERS_RT.befriended, hint);
    if (crew.first) await outbox(tx, channel, CRITTERS_RT.firstSpotter, hint);
  }
}
