import { useEffect, useState } from 'react';

import {
  clearVisitConsentRequest,
  markVisitConsentDismissed,
  setVisitConsentOffered,
  shouldAskVisitConsent,
  shouldOfferVisitConsent,
  useAppActive,
  useLocationStatus,
  useRestedOnTripSurface,
  useVisitConsentRequested,
  visitConsentDismissedAt,
} from '@/lib/location';

import { presentedDepth } from '../sheet/presenter';
import { VisitConsentSheet } from './VisitConsentSheet';

export interface VisitConsentHostProps {
  /** A consent row for visit detection exists (the user decided either way). */
  readonly decided: boolean;
  readonly onAnswer: (granted: boolean) => void;
  readonly now?: () => number;
}

const somethingPresented = () => presentedDepth.value > 0;

/**
 * Asks for visit detection once, at a calm moment: a trip day, nothing decided, "Not now" never
 * answered, the traveller resting on one of the trip's own screens with no sheet or ceremony over
 * it. After "Not now" the sheet opens only when asked for (the trip screen's row). Until the
 * answer is "Turn on", no visit is recorded.
 */
export function VisitConsentHost({ decided, onAnswer, now = Date.now }: VisitConsentHostProps) {
  const status = useLocationStatus();
  const requested = useVisitConsentRequested();
  const restedOnTripSurface = useRestedOnTripSurface({
    active: useAppActive(),
    covered: somethingPresented,
  });
  const [open, setOpen] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [dismissed, setDismissed] = useState(() => visitConsentDismissedAt() !== null);
  const tripDaySessionRunning = status.running && status.tripMode === 'trip_day';
  const ask = shouldAskVisitConsent({
    tripDaySessionRunning,
    decided,
    dismissed,
    restedOnTripSurface,
  });
  const offered = shouldOfferVisitConsent({ tripDaySessionRunning, decided, dismissed });

  // Once up, the sheet stays until it is answered: the moment passing must not pull it away.
  // An answer given here holds even before its consent row has synced back.
  if (!open && ((ask && !answered) || (requested && !decided))) setOpen(true);
  useEffect(() => {
    setVisitConsentOffered(offered);
    return () => setVisitConsentOffered(false);
  }, [offered]);

  if (!open) return null;
  return (
    <VisitConsentSheet
      onAnswer={(granted) => {
        setOpen(false);
        setAnswered(true);
        clearVisitConsentRequest();
        if (granted) {
          onAnswer(true);
          return;
        }
        markVisitConsentDismissed(now());
        setDismissed(true);
      }}
    />
  );
}
