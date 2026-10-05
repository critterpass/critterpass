/** The last-free-redraft interstitial wired to the phone: the redraft it holds, the quota, the boost. */
import type { RedraftReasonKey } from '@cp/domain';

import { forgetChangeDayAsk } from '../data/change-day-ask';
import { useDraftTrip } from '../data/draft-trip';
import { redraftBoost } from '../boost-slot';
import { LastRedraftView } from './last-redraft-interstitial';
import { outcomeLine } from './outcome-copy';
import { useSendRedraft } from './use-send-redraft';

export interface LastRedraftSheetProps {
  readonly tripId: string;
  readonly day: number;
  readonly reasons: readonly RedraftReasonKey[];
  readonly note: string;
  readonly free: boolean;
}

export function LastRedraftSheet({ tripId, day, reasons, note, free }: LastRedraftSheetProps) {
  const trip = useDraftTrip(tripId);
  // The change-a-day sheet is under this question: closing it returns there, sending leaves both.
  const redraft = useSendRedraft(tripId, trip?.draftVersionId ?? null, 1, () =>
    forgetChangeDayAsk(tripId),
  );
  if (trip === undefined || trip === null) return null;
  const boost = redraftBoost();
  const limit = trip.quota.limit ?? trip.quota.used + 1;
  return (
    <LastRedraftView
      guide={trip.guide}
      destination={trip.destinationName}
      n={Math.min(limit, trip.quota.used + 1)}
      limit={limit}
      sending={redraft.pending}
      problem={redraft.outcome === null ? null : outcomeLine(redraft.outcome)}
      onUse={() => void redraft.send({ day, reasons, note, free })}
      onBoost={boost === null ? undefined : () => boost(tripId)}
    />
  );
}
