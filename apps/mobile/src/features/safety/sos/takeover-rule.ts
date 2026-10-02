/** Which synced incidents take over this person's screen. */
import { responsesOf } from './sos-model';

/** An SOS older than this when its row syncs is not pushed over the screen any more. */
const TAKEOVER_WINDOW_MS = 30 * 60_000;

export interface OpenSosRow {
  readonly id: string;
  readonly user_id: string;
  readonly opened_at: string;
  readonly responses: unknown;
}

/**
 * The open incidents that should take over this person's screen when their rows sync: recent, not
 * their own, and not one they already saw or answered (on this phone or another).
 */
export function takeoverTargets(
  rows: readonly OpenSosRow[],
  uid: string | null,
  now: number,
): string[] {
  if (uid === null) return [];
  return rows
    .filter((row) => row.user_id !== uid)
    .filter((row) => now - Date.parse(row.opened_at) <= TAKEOVER_WINDOW_MS)
    .filter((row) => !responsesOf(row).has(uid))
    .map((row) => row.id);
}
