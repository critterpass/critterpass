/**
 * The hold chip: counts down to the supplier's own deadline, only while the supplier reports a
 * hold. At zero it says the hold ran out; it never extends or rounds the deadline.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';

import { InfoPill } from '@/ui/chips/InfoPill';

export function remainingLabel(untilMs: number, nowMs: number): string | null {
  const left = Math.floor((untilMs - nowMs) / 1000);
  if (left <= 0) return null;
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  if (minutes >= 60)
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export interface HoldTimerProps {
  readonly until: string;
  readonly now?: () => number;
  readonly onExpired?: () => void;
}

export function HoldTimer({ until, now = Date.now, onExpired }: HoldTimerProps) {
  const { t } = useLingui();
  const untilMs = Date.parse(until);
  const [nowMs, setNowMs] = useState(now());
  const label = remainingLabel(untilMs, nowMs);
  useEffect(() => {
    if (label === null) {
      onExpired?.();
      return undefined;
    }
    const timer = setInterval(() => setNowMs(now()), 1000);
    return () => clearInterval(timer);
  }, [label === null]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <InfoPill
      icon="lock"
      variant="outline"
      testID="supplier-hold-timer"
      accessibilityLabel={
        label === null
          ? t({ id: 'suppliers.hold.ranOutA11y', message: 'The hold ran out' })
          : t({ id: 'suppliers.hold.leftA11y', message: `Hold ends in ${label}` })
      }
    >
      {label === null ? t({ id: 'suppliers.hold.ranOut', message: 'HOLD RAN OUT' }) : label}
    </InfoPill>
  );
}
