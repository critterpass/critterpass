/**
 * The ink countdown pill (3.02): a mint dot and `17d 05:26:47` in tabular figures, ticking every
 * second; "Today" and "Day n" on the trip's clock. Screen readers hear the time left in words,
 * refreshed by the minute.
 */
import { countdownDigits, formatCountdown, type CountdownTrip } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { makePremiumStyles, Text } from '@/ui/premium';

import { spokenLeft } from '../../countdown-chip';

const useStyles = makePremiumStyles((t) => ({
  pill: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: t.space.gap12,
    backgroundColor: t.color.inkSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.gap6,
    alignSelf: 'flex-start',
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.signal.successCheck },
  digits: { fontVariant: ['tabular-nums'] },
}));

function useSecondTick(): Date {
  const [at, setAt] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setAt(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return at;
}

export interface CountdownPillProps {
  readonly target: Date;
  readonly trip: CountdownTrip;
  readonly place: string;
  readonly testID?: string;
}

export function CountdownPill({
  target,
  trip,
  place,
  testID = 'home-countdown',
}: CountdownPillProps) {
  const styles = useStyles();
  const { t } = useLingui();
  const locale = useLocale();
  const display = formatCountdown(useSecondTick(), target, trip);
  let label: string;
  let voice: string;
  if (display.kind === 'today') {
    label = t({ id: 'home.countdown.today', message: 'Today' });
    voice = label;
  } else if (display.kind === 'day') {
    const day = display.day;
    label = t({ id: 'home.countdown.day', message: `Day ${day}` });
    voice = label;
  } else {
    label = countdownDigits(display, t({ id: 'home.premium.countdown.dayLetter', message: 'd' }));
    const spoken = spokenLeft(locale, display);
    voice = t({ id: 'home.countdown.spoken', message: `${spoken} to ${place}` });
  }
  return (
    <View style={styles.pill} testID={testID} accessible accessibilityLabel={voice}>
      <View style={styles.dot} />
      <Text variant="buttonSmall" tone="onInk" style={styles.digits}>
        {label}
      </Text>
    </View>
  );
}
