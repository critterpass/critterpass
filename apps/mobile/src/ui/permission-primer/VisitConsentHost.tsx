import { useState } from 'react';

import {
  markVisitConsentDismissed,
  shouldAskVisitConsent,
  useLocationStatus,
  visitConsentDismissedAt,
} from '@/lib/location';

import { VisitConsentSheet } from './VisitConsentSheet';

export interface VisitConsentHostProps {
  /** A consent row for visit detection exists (the user decided either way). */
  readonly decided: boolean;
  readonly onAnswer: (granted: boolean) => void;
  readonly now?: () => number;
}

/** Shows the visit consent sheet once the first trip-day session runs and nothing is decided. */
export function VisitConsentHost({ decided, onAnswer, now = Date.now }: VisitConsentHostProps) {
  const status = useLocationStatus();
  const [answered, setAnswered] = useState(false);
  const ask =
    !answered &&
    shouldAskVisitConsent({
      tripDaySessionRunning: status.running && status.tripMode === 'trip_day',
      decided,
      lastDismissedAt: visitConsentDismissedAt(),
      now: now(),
    });
  if (!ask) return null;
  return (
    <VisitConsentSheet
      onAnswer={(granted) => {
        setAnswered(true);
        if (granted) onAnswer(true);
        else markVisitConsentDismissed(now());
      }}
    />
  );
}
