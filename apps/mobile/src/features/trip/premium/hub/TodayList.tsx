/**
 * What is next, under the hub's switch (1.05): one white row per thing, a colour bar for its kind
 * (pink when it needs the reader, the crew's colours otherwise), when it is, what it is and a muted
 * line. Disruptions lead; Explore and the crew's swipe follow the day's own things.
 */
import { StyleSheet, View } from 'react-native';

import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import type { HubNext } from '../../hub/next-row';
import { crewAccent } from '../components/crew-accent';

function NextRow({ entry, index }: { readonly entry: HubNext; readonly index: number }) {
  const th = usePremiumTheme();
  const bar = entry.tone === 'pink' ? th.accent.pink : crewAccent(index);
  return (
    <PressableScale
      onPress={entry.onPress}
      accessibilityRole="button"
      accessibilityLabel={[entry.label, entry.title, entry.detail].filter(Boolean).join(', ')}
      testID={entry.testID}
    >
      <View
        style={[
          styles.row,
          {
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        <View style={[styles.bar, { backgroundColor: bar }]} />
        <View style={styles.body}>
          {entry.label === null ? null : (
            <Text variant="badge" tone="muted" numberOfLines={1} style={styles.tabular}>
              {entry.label}
            </Text>
          )}
          <Text variant="rowTitle" numberOfLines={2}>
            {entry.title}
          </Text>
          {entry.detail === null ? null : (
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {entry.detail}
            </Text>
          )}
        </View>
      </View>
    </PressableScale>
  );
}

export function TodayList({ entries }: { readonly entries: readonly HubNext[] }) {
  const th = usePremiumTheme();
  if (entries.length === 0) return null;
  return (
    <View style={{ paddingHorizontal: th.space.gap16, gap: th.space.gap10 }} testID="trip-hub-next">
      {entries.map((entry, index) => (
        <NextRow key={entry.testID} entry={entry} index={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  body: { flex: 1, minWidth: 0, gap: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
});
