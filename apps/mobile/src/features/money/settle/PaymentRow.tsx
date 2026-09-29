/**
 * One settle-up row: from → dashed amount → to, its status tag and NUDGE for a request you are
 * owed. When a payment clears while the list is open, the row eases left and a check stamps on
 * (with the stamp's thud); reduced motion fades the check in.
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { useStamp } from '@/motion/patterns/stamp';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Icon } from '@/ui/icons/Icon';
import { SettleRow } from '@/ui/money/SettleRow';
import { Avatar } from '@/ui/people/Avatar';
import { makeStyles, useTheme } from '@/ui/theme';

import type { MoneyMember } from '../data/context';
import { formatAmount } from '../format';
import type { SettleRowModel } from './model';

const SLIDE_PT = 12;

const useStyles = makeStyles((t) => ({
  stamp: {
    position: 'absolute',
    end: t.space['16'],
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
}));

export function useStatusLabel() {
  const { t } = useLingui();
  const locale = useLocale();
  return (row: Pick<SettleRowModel, 'status'>) =>
    upper(
      row.status === 'confirmed'
        ? t({ id: 'money.settle.status.paid', message: 'Paid ✓' })
        : row.status === 'requested'
          ? t({ id: 'money.settle.status.requested', message: 'Requested' })
          : row.status === 'marked_paid'
            ? t({ id: 'money.settle.status.marked', message: 'Marked paid' })
            : row.status === 'disputed'
              ? t({ id: 'money.settle.status.disputed', message: 'Disputed' })
              : t({ id: 'money.settle.status.pending', message: 'Pending' }),
      locale,
    );
}

export function PaymentRow({
  row,
  members,
  onNudge,
  onPress,
}: {
  readonly row: SettleRowModel;
  readonly members: readonly MoneyMember[];
  readonly onNudge: () => void;
  readonly onPress: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const reduced = useReducedImpactMotion();
  const label = useStatusLabel();
  const person = (id: string) => members.find((member) => member.userId === id);
  const from = person(row.fromId);
  const to = person(row.toId);
  // Only a payment that clears while the list is open plays the slide and the stamp.
  const [openAtMount] = useState(row.status !== 'confirmed');
  const cleared = openAtMount && row.status === 'confirmed';
  const x = useSharedValue(0);
  useEffect(() => {
    if (cleared && !reduced) {
      x.value = withTiming(-SLIDE_PT, { duration: tokens.motion.duration.base });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- x is a stable shared value.
  }, [cleared, reduced]);
  const stamp = useStamp({ active: cleared });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const status =
    row.status === 'confirmed' ? 'paid' : row.status === 'plan' ? 'pending' : 'requested';
  return (
    <View>
      <Animated.View style={slide}>
        <SettleRow
          from={{
            name: from?.name ?? '',
            avatar: <Avatar name={from?.name ?? ''} joinIndex={from?.joinIndex ?? 0} decorative />,
          }}
          to={{
            name: to?.name ?? '',
            avatar: <Avatar name={to?.name ?? ''} joinIndex={to?.joinIndex ?? 0} decorative />,
          }}
          amount={formatAmount(row.amountMinor, row.currency, locale)}
          status={row.status === 'disputed' ? 'pending' : status}
          statusLabel={label(row)}
          {...(row.actions.includes('nudge') && row.status === 'requested' ? { onNudge } : {})}
          onPress={onPress}
          testID={`money-settle-row-${row.key}`}
        />
      </Animated.View>
      {cleared ? (
        <Animated.View style={[styles.stamp, stamp]} pointerEvents="none">
          <View style={StyleSheet.absoluteFill} />
          <Icon name="check" size={40} color={theme.semantic.state.success} decorative />
        </Animated.View>
      ) : null}
    </View>
  );
}
