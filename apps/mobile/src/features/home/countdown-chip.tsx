/**
 * The next-up card's countdown chip: `17D 05:26:47` ticking every second in tabular numerals,
 * `05:26:47` inside the last day, then TODAY and DAY n in the destination's zone. The target is the
 * viewer's stored countdown instant (their first outbound flight, else the first day's midnight at
 * the destination), so it ticks the same offline and in any zone. Screen readers hear the time left
 * in words ("17 days, 5 hours to Bali"), refreshed by the minute rather than every tick.
 */
import { countdownDigits, formatCountdown, type CountdownTrip } from '@cp/domain';
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { InfoPill } from '@/ui/chips/InfoPill';

export interface CountdownChipProps {
  readonly target: Date;
  readonly trip: CountdownTrip;
  /** The destination, for the spoken label. */
  readonly place: string;
  readonly now?: () => Date;
  readonly testID?: string;
}

const systemNow = (): Date => new Date();

export function useSecondTick(now: () => Date = systemNow): Date {
  const [at, setAt] = useState(now);
  useEffect(() => {
    const timer = setInterval(() => setAt(now()), 1000);
    return () => clearInterval(timer);
  }, [now]);
  return at;
}

type Spoken = readonly [number, 'day' | 'hour' | 'minute'];

/** "17 days, 5 hours" (or "5 hours, 26 minutes" inside the last day), in the reader's language. */
export function spokenLeft(
  locale: string,
  display: { readonly days: number; readonly hours: number; readonly minutes: number },
): string {
  const parts: Spoken[] =
    display.days > 0
      ? [
          [display.days, 'day'],
          [display.hours, 'hour'],
        ]
      : [
          [display.hours, 'hour'],
          [display.minutes, 'minute'],
        ];
  const kept = parts.filter(([value]) => value > 0);
  return format.list(
    locale,
    (kept.length > 0 ? kept : parts.slice(-1)).map(([value, unit]) =>
      format.number(locale, value, { style: 'unit', unit, unitDisplay: 'long' }),
    ),
    { type: 'unit', style: 'long' },
  );
}

export function CountdownChip({
  target,
  trip,
  place,
  now,
  testID = 'home-countdown',
}: CountdownChipProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const at = useSecondTick(now);
  const display = formatCountdown(at, target, trip);

  if (display.kind === 'today') {
    return (
      <InfoPill testID={testID}>
        {upper(t({ id: 'home.countdown.today', message: 'Today' }), locale)}
      </InfoPill>
    );
  }
  if (display.kind === 'day') {
    const day = display.day;
    return (
      <InfoPill testID={testID}>
        {upper(t({ id: 'home.countdown.day', message: `Day ${day}` }), locale)}
      </InfoPill>
    );
  }
  const dayLetter = t({ id: 'home.countdown.dayLetter', message: 'D' });
  const spoken = spokenLeft(locale, display);
  return (
    <InfoPill
      testID={testID}
      accessibilityLabel={t({ id: 'home.countdown.spoken', message: `${spoken} to ${place}` })}
    >
      {countdownDigits(display, dayLetter)}
    </InfoPill>
  );
}
