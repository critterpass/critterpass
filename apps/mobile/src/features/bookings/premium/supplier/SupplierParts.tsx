/**
 * Small pieces the premium supplier sheets share: the hold countdown chip (only while the supplier
 * reports a hold, never extended or rounded), a muted lead line, and the pink error line.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, Text, usePremiumTheme } from '@/ui/premium';

import { remainingLabel } from '../../supplier/HoldTimer';

export function HoldChip({
  until,
  onExpired,
}: {
  readonly until: string;
  readonly onExpired?: (() => void) | undefined;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const untilMs = Date.parse(until);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const label = remainingLabel(untilMs, nowMs);
  const over = label === null;
  useEffect(() => {
    if (over) {
      onExpired?.();
      return undefined;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps -- runs once per hold state
  const look = over ? th.color.status.voteOpen : th.color.status.booked;
  return (
    <View
      testID="supplier-hold-timer"
      accessible
      accessibilityLabel={
        over
          ? t({ id: 'suppliers.hold.ranOutA11y', message: 'The hold ran out' })
          : t({ id: 'suppliers.hold.leftA11y', message: `Hold ends in ${label}` })
      }
      style={[styles.chip, { backgroundColor: look.bg, borderRadius: th.radius.statusTag }]}
    >
      <Icon name="lock" size={12} color={look.text} />
      <Text variant="badge" color={look.text}>
        {over ? t({ id: 'suppliers.hold.ranOut', message: 'HOLD RAN OUT' }) : label}
      </Text>
    </View>
  );
}

export function ErrorLine({ text, testID }: { readonly text: string; readonly testID?: string }) {
  const th = usePremiumTheme();
  return (
    <Text variant="label" color={th.color.destructive.helper} {...(testID ? { testID } : {})}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    height: 24,
    paddingHorizontal: 9,
  },
});
