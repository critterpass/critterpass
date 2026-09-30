/**
 * The live side of setup (`trip_setup:{trip_id}`, docs/api-contracts-async.md §1): hints that a
 * step moved, a calendar synced, the band or the rooms changed, a must-do was fit-checked. Synced
 * rows carry the data; these hints only tell a screen to re-read what sync cannot (the band, the
 * caller's own fit, window options for another length) and to play the motion that goes with the
 * change. Presence on the same channel says who has setup open right now.
 */
/* eslint-disable lingui/no-unlocalized-strings -- channel namespaces, never copy. */
import type { RtEnvelope } from '@cp/domain';

import { usePresence, type PresenceMember } from '@/data/realtime/use-presence';
import { useChannel } from '@/data/realtime/use-channel';

export type SetupHint = Pick<RtEnvelope, 'type' | 'data'>;

/** Calls `onHint` for every `trip_setup` event and once after each (re)subscribe. */
export function useSetupHints(tripId: string | null, onHint: (hint: SetupHint | null) => void) {
  useChannel('trip_setup', tripId, {
    onEvent: (envelope) => onHint({ type: envelope.type, data: envelope.data }),
    // A reset or a fresh subscription may have missed hints: re-read everything once.
    onChannelReset: () => onHint(null),
    onSubscribed: () => onHint(null),
  });
}

/** Who has setup open now (one entry per person). */
export function useSetupPresence(tripId: string | null): readonly PresenceMember[] {
  return usePresence('trip_setup', tripId);
}
