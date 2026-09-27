import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';

import { Stack } from '../layout/Stack';
import type { TextVariant } from '../text/Text';
import { Text } from '../text/Text';
import { useTheme } from '../theme';

export type CountdownUnits = 'dhms' | 'hms' | 'ms';

type Unit = 'day' | 'hour' | 'minute' | 'second';

const UNIT_MS: Readonly<Record<Unit, number>> = {
  day: 86_400_000,
  hour: 3_600_000,
  minute: 60_000,
  second: 1000,
};
const UNITS_FOR: Readonly<Record<CountdownUnits, readonly Unit[]>> = {
  dhms: ['day', 'hour', 'minute', 'second'],
  hms: ['hour', 'minute', 'second'],
  ms: ['minute', 'second'],
};
const TICK_MS = 1000;

/** Splits a duration into the requested units; the largest unit absorbs any overflow. */
export function splitDuration(ms: number, units: CountdownUnits): readonly [Unit, number][] {
  let rest = Math.max(0, ms);
  return UNITS_FOR[units].map((unit) => {
    const value = Math.floor(rest / UNIT_MS[unit]);
    rest -= value * UNIT_MS[unit];
    return [unit, value] as [Unit, number];
  });
}

/** Spoken form with long units, dropping leading zero units ("2 hours, 10 minutes, 5 seconds"). */
export function spokenDuration(locale: string, ms: number, units: CountdownUnits): string {
  const parts = splitDuration(ms, units);
  const firstNonZero = parts.findIndex(([, value]) => value > 0);
  const kept = firstNonZero === -1 ? parts.slice(-1) : parts.slice(firstNonZero);
  return format.list(
    locale,
    kept.map(([unit, value]) =>
      format.number(locale, value, { style: 'unit', unit, unitDisplay: 'long' }),
    ),
    { type: 'unit', style: 'long' },
  );
}

export interface CountdownProps {
  readonly target: Date;
  /** @default 'dhms' */
  readonly units?: CountdownUnits;
  /** Caption above the numbers ("Leave by", "Voting closes in"). */
  readonly label?: string;
  /** Below this many ms left the numbers turn `state.warning` and the caption switches. */
  readonly urgentBelowMs?: number;
  /** Caption in the urgent state, so the change is never colour-only ("Leave now"). */
  readonly urgentLabel?: string;
  /** Screen-reader announcement interval. @default 60000 (one minute) */
  readonly announceEveryMs?: number;
  /** @default 'displayHero' */
  readonly variant?: TextVariant;
  readonly onElapsed?: () => void;
  readonly testID?: string;
}

/** Live countdown with localised units, an urgent colour + label state and interval announcements. */
export function Countdown({
  target,
  units = 'dhms',
  label,
  urgentBelowMs,
  urgentLabel,
  announceEveryMs = 60_000,
  variant = 'displayHero',
  onElapsed,
  testID,
}: CountdownProps) {
  const theme = useTheme();
  const locale = useLocale();
  const [now, setNow] = useState(() => Date.now());
  const lastAnnounced = useRef(now);
  const elapsedFired = useRef(false);
  const remaining = Math.max(0, target.getTime() - now);
  const urgent = urgentBelowMs !== undefined && remaining < urgentBelowMs;
  const caption = urgent && urgentLabel ? urgentLabel : label;
  const spoken = [caption, spokenDuration(locale, remaining, units)].filter(Boolean).join(', ');

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (remaining > 0 || elapsedFired.current) return;
    elapsedFired.current = true;
    onElapsed?.();
  }, [remaining, onElapsed]);

  useEffect(() => {
    if (now - lastAnnounced.current < announceEveryMs) return;
    lastAnnounced.current = now;
    AccessibilityInfo.announceForAccessibility(spoken);
  }, [now, announceEveryMs, spoken]);

  const wasUrgent = useRef(urgent);
  useEffect(() => {
    if (wasUrgent.current === urgent) return;
    wasUrgent.current = urgent;
    if (urgent) AccessibilityInfo.announceForAccessibility(spoken);
  }, [urgent, spoken]);

  const color = urgent ? theme.semantic.state.warning : undefined;
  const numbers = splitDuration(remaining, units)
    .map(([unit, value]) => format.countdownUnit(locale, value, unit))
    .join(' ');
  return (
    <Stack gap="4" testID={testID} accessible accessibilityRole="timer" accessibilityLabel={spoken}>
      {caption ? (
        <Text variant="eyebrow" color={color}>
          {caption}
        </Text>
      ) : null}
      <Text variant={variant} color={color} autoFit>
        {numbers}
      </Text>
    </Stack>
  );
}
