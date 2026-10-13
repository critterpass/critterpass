/** The last-free-redraft interstitial wired to the phone: the redraft it holds, the quota, the boost. */
import type { RedraftReasonKey } from '@cp/domain';

import { forgetChangeDayAsk } from '../data/change-day-ask';
import { useDraftTrip } from '../data/draft-trip';
import { redraftBoost } from '../boost-slot';
import { outcomeLine } from './outcome-copy';
import { useSendRedraft } from './use-send-redraft';

export interface LastRedraftSheetProps {
  readonly tripId: string;
  readonly day: number;
  readonly reasons: readonly RedraftReasonKey[];
  readonly note: string;
  readonly free: boolean;
}

/**
 * The last free redraft's state for either look: the trip (undefined while it loads, null when it
 * is gone), its quota, sending the held redraft, and the boost when one is offered.
 */
export function useLastRedraft({ tripId, day, reasons, note, free }: LastRedraftSheetProps) {
  const trip = useDraftTrip(tripId);
  // The change-a-day sheet is under this question: closing it returns there, sending leaves both.
  const redraft = useSendRedraft(tripId, trip?.draftVersionId ?? null, 1, () =>
    forgetChangeDayAsk(tripId),
  );
  const boost = redraftBoost();
  const limit = trip == null ? 0 : (trip.quota.limit ?? trip.quota.used + 1);
  return {
    trip,
    limit,
    n: trip == null ? 0 : Math.min(limit, trip.quota.used + 1),
    sending: redraft.pending,
    problem: redraft.outcome === null ? null : outcomeLine(redraft.outcome),
    use: () => void redraft.send({ day, reasons, note, free }),
    boost: boost === null ? undefined : () => boost(tripId),
  };
}
