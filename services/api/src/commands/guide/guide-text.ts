/**
 * Asking the worker to bring guide-written text up to date in its readers' languages
 * (`guide_text.translate`), from the api: when someone's app language becomes known or changes, and
 * when someone joins a crew or a trip. The sweep itself decides what is missing, so these only
 * name the trips and crews whose readers changed. Always in the caller's transaction.
 */
import { sendInTx } from '@cp/db';
import { GUIDE_QUEUES, type GuideTextTranslateJob } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

/** Trips whose guide text nobody reads any more. */
const OVER = ['archived', 'cancelled'];

export async function enqueueGuideTextTranslation(
  tx: pg.PoolClient,
  target: { readonly tripId: string } | { readonly crewId: string },
): Promise<void> {
  const job: GuideTextTranslateJob =
    'tripId' in target ? { trip_id: target.tripId } : { crew_id: target.crewId };
  await sendInTx(tx, GUIDE_QUEUES.translate, job, {
    singletonKey: 'tripId' in target ? target.tripId : target.crewId,
  });
}

async function enqueueAll(
  tx: pg.PoolClient,
  rows: readonly { readonly trip_id: string | null; readonly crew_id: string }[],
): Promise<void> {
  for (const crewId of new Set(rows.map((row) => row.crew_id))) {
    await enqueueGuideTextTranslation(tx, { crewId });
  }
  for (const row of rows) {
    if (row.trip_id !== null) await enqueueGuideTextTranslation(tx, { tripId: row.trip_id });
  }
}

/** Every crew `uid` is active in, with each of its trips still running. */
export async function enqueueGuideTextForUser(tx: pg.PoolClient, uid: string): Promise<void> {
  const rows = await asSystemRole(tx, async () => {
    const found = await tx.query<{ trip_id: string | null; crew_id: string }>(
      `SELECT t.id AS trip_id, cm.crew_id
         FROM crew_members cm
         LEFT JOIN trips t ON t.crew_id = cm.crew_id AND NOT (t.status = ANY($2))
        WHERE cm.user_id = $1 AND cm.status = 'active'`,
      [uid, OVER],
    );
    return found.rows;
  });
  await enqueueAll(tx, rows);
}

const MEMBERSHIP_EVENTS: ReadonlySet<string> = new Set(['crew.member_joined', 'rsvp.changed']);

/**
 * `onEventAppended` hook: someone joined a crew, or answered for a trip. What already exists for
 * them (the plan, the quests, the crew's pitches) is translated into their language.
 */
export async function guideTextMembershipHook(
  tx: pg.PoolClient,
  event: { readonly type: string; readonly tripId: string | null; readonly crewId: string | null },
): Promise<void> {
  if (!MEMBERSHIP_EVENTS.has(event.type)) return;
  const { tripId, crewId } = event;
  if (tripId === null && crewId === null) return;
  const rows = await asSystemRole(tx, async () => {
    const found = await tx.query<{ trip_id: string | null; crew_id: string }>(
      `SELECT t.id AS trip_id, c.id AS crew_id
         FROM crews c
         LEFT JOIN trips t ON t.crew_id = c.id AND NOT (t.status = ANY($3))
          AND ($1::uuid IS NULL OR t.id = $1)
        WHERE c.id = coalesce($2::uuid, (SELECT crew_id FROM trips WHERE id = $1))`,
      [tripId, crewId, OVER],
    );
    return found.rows;
  });
  await enqueueAll(tx, rows);
}
