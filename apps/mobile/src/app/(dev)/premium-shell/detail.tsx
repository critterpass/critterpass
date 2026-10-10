import { StyleSheet, View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';
import { PushScreen, ZoomTarget } from '@/ui/premium/shell';

export const __CP_DEV_ROUTE__ = true;

/** The zoom destination (1.05): headerless, the hero under clear-glass back. */
export default function DemoDetail() {
  const t = usePremiumTheme();
  return (
    <PushScreen title="Bali" backLabel="Back" headerless testID="premium-shell-detail">
      <ZoomTarget zoomId="demo-trip">
        <View style={[styles.hero, { backgroundColor: t.accent.sky }]}>
          <Text variant="label" color={t.color.onInk}>
            Day 4 of 8 · Thu 15 Oct
          </Text>
          <Text variant="hero" color={t.color.onInk}>
            Bali
          </Text>
        </View>
      </ZoomTarget>
      <View style={[styles.body, { backgroundColor: t.color.ground }]}>
        {['07:00 Boat to Penida', '10:30 Kelingking lookout', '13:00 Lunch at Warung Ibu'].map(
          (line) => (
            <View
              key={line}
              style={[styles.row, { backgroundColor: t.color.card, borderRadius: t.radius.card }]}
            >
              <Text variant="rowTitle">{line}</Text>
            </View>
          ),
        )}
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 420, justifyContent: 'flex-end', padding: 24 },
  body: { marginTop: -34, borderTopLeftRadius: 34, borderTopRightRadius: 34, padding: 16, gap: 10 },
  row: { padding: 16 },
});
