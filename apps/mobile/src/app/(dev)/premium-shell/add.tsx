import { StyleSheet, View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

export const __CP_DEV_ROUTE__ = true;

/** The half sheet the `+` opens (1.06's "Add a booking"); on iOS 26 the spike morphs it from the `+`. */
export default function DemoAdd() {
  const t = usePremiumTheme();
  return (
    <SheetScreen
      title="Add a booking"
      cancelLabel="Cancel"
      scroll={false}
      testID="premium-shell-add"
    >
      <View style={styles.tiles}>
        {['Forward an email', 'Scan a ticket', 'Add by hand'].map((label) => (
          <View
            key={label}
            style={[styles.tile, { backgroundColor: t.color.card, borderRadius: t.radius.cardRow }]}
          >
            <Text variant="label" align="center">
              {label}
            </Text>
          </View>
        ))}
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12 },
  tile: { flex: 1, height: 124, alignItems: 'center', justifyContent: 'center', padding: 8 },
});
