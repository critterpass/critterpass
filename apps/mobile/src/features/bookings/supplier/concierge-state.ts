/** Which state the ops desk card shows (wire values only; the card holds the copy). */
/* eslint-disable lingui/no-unlocalized-strings -- card states and wire values, never copy. */
import type { RequestConciergeResult } from '@cp/domain';

/** What the card says, from the desk's answer to `request_concierge`. */
export type ConciergeState =
  /** Outside staffed hours: when the desk answers. */
  | 'closed'
  /** A clinic call, with a policy on file the traveller has not yet agreed to share. */
  | 'clinic_share'
  /** A clinic call whose insurance details already go with it. */
  | 'clinic_shared'
  /** A clinic call with no policy on file. */
  | 'clinic'
  /** A message to a place or anything else, picked up by a person. */
  | 'picked_up';

export function conciergeState(
  result: Pick<RequestConciergeResult, 'kind' | 'desk_open' | 'insurance'>,
): ConciergeState {
  if (!result.desk_open) return 'closed';
  if (result.kind !== 'clinic') return 'picked_up';
  if (result.insurance?.on_file !== true) return 'clinic';
  return result.insurance.consented ? 'clinic_shared' : 'clinic_share';
}
