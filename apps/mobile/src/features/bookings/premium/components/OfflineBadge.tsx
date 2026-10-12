/**
 * "9 offline" (7.02): how many of the trip's bookings open on this phone with no signal, as the
 * booked-tint tag with its dot, under the Bookings | Money switch.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';

export function OfflineBadge({ count }: { readonly count: number }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const tint = th.color.status.booked;
  return (
    <View style={[styles.row, { paddingHorizontal: th.space.titleGutter }]}>
      <View
        style={[styles.tag, { backgroundColor: tint.bg }]}
        accessibilityLabel={t({
          id: 'bookings.premium.offlineCountLong',
          message: plural(count, {
            one: '# booking opens with no signal',
            other: '# bookings open with no signal',
          }),
        })}
        testID="bookings-offline-count"
      >
        <View style={[styles.dot, { backgroundColor: tint.text }]} />
        <Text variant="badge" color={tint.text}>
          {t({ id: 'bookings.premium.offlineCount', message: `${count} offline` })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
