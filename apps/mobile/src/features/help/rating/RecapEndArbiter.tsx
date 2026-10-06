/**
 * Mounted where a recap's story hands over (the recap page, once the story has ended): decides
 * the one moment the end gets and, when that is the store's review, asks for it after the page
 * has settled. Renders nothing; the store draws its own sheet.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and command names, never copy. */
import { generateUuidV7, type RecordRatingPromptPayload } from '@cp/domain';
import { useEffect } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { requestStoreReview } from '@/lib/store-review';

import { arbitrateRecapEnd, type RatingRows } from './rating-prompt';

export const recordRatingPromptCommand = defineClientCommand<RecordRatingPromptPayload>({
  name: 'record_rating_prompt',
  offline: true,
});

/** Long enough for the recap page to land after the story, short enough to still be the moment. */
const SETTLE_MS = 1200;

const TRIP_SQL = 'SELECT trip_id FROM recaps WHERE id = ?';
const UID_SQL = 'SELECT value FROM local_state WHERE id = ?';
const DISRUPTION_SQL =
  'SELECT 1 AS open FROM disruptions WHERE trip_id = ? AND resolved_at IS NULL LIMIT 1';
const ACTIVE_SQL =
  "SELECT 1 AS active FROM trips WHERE phase = 'in' AND cancelled_at IS NULL LIMIT 1";
const MOODS_SQL =
  'SELECT mood, sent_at FROM feedback_tickets WHERE user_id = ? AND mood IS NOT NULL';
const LAST_SQL = 'SELECT MAX(shown_at) AS at FROM rating_prompts WHERE user_id = ? AND shown = 1';

export function RecapEndArbiter({ recapId }: { readonly recapId: string }) {
  const { db, commands } = useLocalFirst();
  useEffect(() => {
    let tripId: string | null = null;
    const rows = async (): Promise<RatingRows> => {
      const one = async <Row,>(sql: string, params: unknown[]): Promise<Row | undefined> =>
        (await db.getAll<Row>(sql, params).catch(() => []))[0];
      tripId = (await one<{ trip_id: string }>(TRIP_SQL, [recapId]))?.trip_id ?? null;
      const uid = (await one<{ value: string }>(UID_SQL, [OWNER_UID_KEY]))?.value ?? '';
      return {
        openDisruption:
          tripId !== null && (await one<{ open: number }>(DISRUPTION_SQL, [tripId])) !== undefined,
        tripActive: (await one<{ active: number }>(ACTIVE_SQL, [])) !== undefined,
        moods: await db
          .getAll<{ mood: string | null; sent_at: string | null }>(MOODS_SQL, [uid])
          .catch(() => []),
        lastPromptAt: (await one<{ at: string | null }>(LAST_SQL, [uid]))?.at ?? null,
      };
    };
    const timer = setTimeout(() => {
      void arbitrateRecapEnd(
        recapId,
        // Neither the free-trip ending card nor the rate-the-trip toast exists in the app yet.
        { ftfEnding: false, rateTripDue: false },
        {
          rows,
          ask: requestStoreReview,
          record: (asked) =>
            commands.send(recordRatingPromptCommand, {
              id: generateUuidV7(),
              trip_id: tripId,
              shown: asked,
            }),
          now: () => new Date(),
        },
      );
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [recapId, db, commands]);
  return null;
}
