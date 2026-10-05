/**
 * Add to plan reads the place from the phone. A place the page drew from the api (a search result
 * nobody recommends) is not there, so before the sheet opens it is saved to the trip's Ideas, which
 * brings it over; a refused save says so instead of opening an empty sheet. The save is
 * provisional: backing out of the sheet takes it out again (./provisional-idea).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, wire values and toast ids, never copy. */
import { generateUuidV7 } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useCallback } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { toast } from '@/motion/island-toast';

import { saveIdeaCommand } from '../search/commands';
import { holdProvisionalIdea } from './provisional-idea';

// An idea the phone queued itself has no name until the server's row syncs: the sheet would open
// empty on it, so only a named idea counts as the place being here.
const HELD_SQL = `SELECT 1 AS held FROM pois WHERE id = ?1
  UNION ALL
  SELECT 1 FROM trip_ideas WHERE trip_id = ?2 AND poi_id = ?1 AND deleted_at IS NULL
    AND coalesce(name, '') <> ''
  LIMIT 1`;

interface Reader {
  readonly getAll: <T>(sql: string, params: unknown[]) => Promise<T[]>;
}

const POLL_MS = 300;
const WAIT_MS = 8_000;

/** Whether the phone holds the place, as a synced place or as one of the trip's ideas. */
export function placeHeld(db: Reader, tripId: string, placeId: string): Promise<boolean> {
  return db.getAll<{ held: number }>(HELD_SQL, [placeId, tripId]).then(
    (rows) => rows.length > 0,
    () => false,
  );
}

/** Waits for a saved place to land on the phone; gives up after a few seconds and goes on. */
export async function untilPlaceHeld(db: Reader, tripId: string, placeId: string): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    if (await placeHeld(db, tripId, placeId)) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

type SaveIdea = (payload: {
  idea_id: string;
  trip_id: string;
  poi_id: string;
  source: 'search';
}) => Promise<{ readonly kind: string }>;

/**
 * Makes sure the phone holds the place before Add to plan opens: held already, or saved to Ideas
 * for the sheet's sake (taken back out if she then backs out). False when the save was refused.
 */
export async function ensurePlaceOnPhone(
  db: Parameters<typeof holdProvisionalIdea>[0] & Reader,
  send: SaveIdea,
  tripId: string,
  placeId: string,
): Promise<boolean> {
  if (await placeHeld(db, tripId, placeId)) return true;
  const ideaId = generateUuidV7();
  const result = await send({
    idea_id: ideaId,
    trip_id: tripId,
    poi_id: placeId,
    source: 'search',
  });
  if (result.kind === 'rejected' || result.kind === 'unavailable') return false;
  holdProvisionalIdea(db, ideaId, placeId);
  await untilPlaceHeld(db, tripId, placeId);
  return true;
}

/** Runs `then` once the phone holds the place (at once when it already does). */
export function usePlaceOnPhone(
  tripId: string | null,
  placeId: string,
  name: string,
): (then: () => void) => void {
  const { send } = useCommand(saveIdeaCommand);
  const { db } = useLocalFirst();
  return useCallback(
    (then: () => void) => {
      if (tripId === null) {
        then();
        return;
      }
      void ensurePlaceOnPhone(db, send, tripId, placeId).then((ok) => {
        if (ok) {
          then();
          return;
        }
        toast.show({
          id: 'place-add-failed',
          title: t({
            id: 'explore.detail.addFailed',
            message: `Couldn’t add ${name}. Try again.`,
          }),
        });
      });
    },
    [send, db, tripId, placeId, name],
  );
}
