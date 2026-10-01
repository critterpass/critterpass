/**
 * Asking for a translation sweep. Any area that writes guide text for a trip (or pitches for a
 * crew) calls `enqueueGuideTextTranslation` in the transaction that writes it; the sweep works out
 * what is missing, so callers pass nothing but the trip or the crew.
 *
 * The worker also asks by itself after the events that mean new guide text exists: a finished
 * draft or redraft, and a morning briefing.
 */
import { sendInTx } from '@cp/db';
import { GUIDE_QUEUES, SOURCE_APP_LOCALE, type GuideTextTranslateJob } from '@cp/domain';
import type pg from 'pg';

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

/**
 * A crew sweep after new guide text was stored for the crew (a pitch), asked for only when
 * someone in the crew reads another language than the one the guide writes in.
 */
export async function enqueueCrewGuideTextIfRead(tx: pg.PoolClient, crewId: string): Promise<void> {
  const { rows } = await tx.query<{ read: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM crew_members cm
        WHERE cm.crew_id = $1 AND cm.status = 'active' AND app.user_locale(cm.user_id) <> $2
     ) AS read`,
    [crewId, SOURCE_APP_LOCALE],
  );
  if (rows[0]?.read === true) await enqueueGuideTextTranslation(tx, { crewId });
}

/** Worker-appended events after which a trip has guide text it may not have had before. */
export const GUIDE_TEXT_EVENTS: ReadonlySet<string> = new Set([
  'draft.ready',
  'redraft.delivered',
  'briefing.built',
  'quest.published',
]);

export async function guideTextEventHook(
  tx: pg.PoolClient,
  event: { readonly type: string; readonly tripId: string | null },
): Promise<void> {
  if (event.tripId === null || !GUIDE_TEXT_EVENTS.has(event.type)) return;
  await enqueueGuideTextTranslation(tx, { tripId: event.tripId });
}
