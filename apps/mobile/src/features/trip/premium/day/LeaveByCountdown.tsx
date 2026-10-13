/**
 * The hero's countdown under the leave-by ("22:00 to go", or that the time has passed), on its own
 * second clock so only this line renders each second. It counts on from the page's minute clock,
 * so the page and the line always agree on the time.
 */
import { premium } from '@cp/design-tokens';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { useNow } from '@/lib/time/use-now';
import { Text } from '@/ui/premium';

import { heroCopy, ringCounting } from '../../day-of/day-of-copy';
import type { LeaveByView } from '../../leave-by/model';

export function LeaveByCountdown({
  view,
  now,
  guideName,
}: {
  readonly view: LeaveByView;
  readonly now: Date;
  readonly guideName: string;
}) {
  const locale = useLocale();
  const tick = useNow(1000, { enabled: ringCounting(view, now) });
  // The page's time and the second clock's reading when it arrived: the line adds what the second
  // clock has counted since.
  const [anchor, setAnchor] = useState(() => ({ base: now.getTime(), at: tick.getTime() }));
  if (anchor.base !== now.getTime()) setAnchor({ base: now.getTime(), at: tick.getTime() });
  const at = new Date(anchor.base + Math.max(0, tick.getTime() - anchor.at));
  const ring = heroCopy(view, at, guideName, locale).ring;
  if (ring === null) return null;
  return (
    <Text
      variant="headline"
      color={premium.accent.paper}
      style={styles.line}
      accessibilityLabel={ring.spoken}
      testID="trip-day-countdown"
    >
      {ring.spoken}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { opacity: 0.92, fontVariant: ['tabular-nums'] },
});
