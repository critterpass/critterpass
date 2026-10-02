/**
 * Asking for the guide's disruption words in the crew's other languages. A disruption job calls
 * this in the transaction that writes a title, summary or watch line; the trip's translation sweep
 * (services/worker/src/jobs/i18n) works out what is missing. Nothing is queued while everyone who
 * reads the trip reads the language the guide writes in.
 */
import { SOURCE_APP_LOCALE } from '@cp/domain';
import type pg from 'pg';

import { enqueueGuideTextTranslation } from '../i18n/enqueue';

export async function translateDisruptionWords(tx: pg.PoolClient, tripId: string): Promise<void> {
  const { rows } = await tx.query<{ read: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM (
         SELECT tp.user_id FROM trip_participants tp WHERE tp.trip_id = $1 AND tp.rsvp <> 'out'
         UNION
         SELECT cm.user_id FROM crew_members cm JOIN trips t ON t.crew_id = cm.crew_id
          WHERE t.id = $1 AND cm.status = 'active'
       ) reader WHERE app.user_locale(reader.user_id) <> $2
     ) AS read`,
    [tripId, SOURCE_APP_LOCALE],
  );
  if (rows[0]?.read === true) await enqueueGuideTextTranslation(tx, { tripId });
}
