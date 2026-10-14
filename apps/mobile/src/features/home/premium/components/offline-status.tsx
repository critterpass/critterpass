/**
 * Home's offline line under the trip's card, as a status tag with its dot (as Bookings' "9
 * offline"): green "Ready offline", yellow while something is still downloading, tangerine when
 * the phone has no room. While the server refuses the upload queue it says that instead, as a
 * muted sentence: changes made here are not reaching the crew, which matters more.
 */
import type { HomeTripInput } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';

import { useOfflineLine, useOfflineLineCopy } from '../../offline-line';

export function OfflineStatus({
  trip,
  now,
}: {
  readonly trip: HomeTripInput | null;
  readonly now: Date;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const copy = useOfflineLineCopy();
  const { held, line } = useOfflineLine(trip, now);
  if (held) {
    return (
      <Text variant="caption" tone="muted" testID="home-sync-held">
        {t({
          id: 'home.offline.held',
          message: "Some changes can't be sent yet. We'll keep trying when the app is opened.",
        })}
      </Text>
    );
  }
  if (line === null) return null;
  const tint =
    line.kind === 'ready'
      ? th.color.status.booked
      : line.kind === 'no_space'
        ? th.color.status.tangerine
        : th.color.status.maybe;
  return (
    <View style={styles.row}>
      <View
        style={[styles.tag, { backgroundColor: tint.bg }]}
        accessible
        accessibilityLabel={copy(line)}
        testID={line.kind === 'ready' ? 'home-offline-ready' : 'home-offline-pending'}
      >
        <View style={[styles.dot, { backgroundColor: tint.text }]} />
        <Text variant="badge" color={tint.text} numberOfLines={1} style={styles.shrink}>
          {copy(line)}
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
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    flexShrink: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  shrink: { flexShrink: 1 },
});
