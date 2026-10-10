import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, IconButton, Text, usePremiumTheme } from '@/ui/premium';
import { PlusSheetMorph, RootScreen, type MorphRect } from '@/ui/premium/shell';

import { DEMO_ROWS, DemoRowView } from '../demo-rows';

export const __CP_DEV_ROUTE__ = true;

/**
 * The drawn root header (Android's, and iOS tabs without a stack) and the drawn `+` → sheet morph
 * (1.06): the floating ink `+` grows into the sheet while the page steps back.
 */
export default function DrawnTab() {
  const t = usePremiumTheme();
  const plus = useRef<View>(null);
  const [anchor, setAnchor] = useState<MorphRect | null>(null);
  const [open, setOpen] = useState(false);

  const openMorph = () => {
    plus.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  return (
    <PlusSheetMorph
      open={open}
      anchor={anchor}
      onRequestClose={() => setOpen(false)}
      sheet={
        <View style={styles.sheet} testID="premium-shell-morph-sheet">
          <Text variant="title">Add a booking</Text>
          <Text variant="rowText" tone="muted">
            Forward an email, scan a ticket or add it by hand.
          </Text>
          <Button label="Done" onPress={() => setOpen(false)} testID="premium-shell-morph-done" />
        </View>
      }
    >
      <RootScreen title="Drawn" header="drawn" testID="premium-shell-drawn">
        {({ scrollProps, largeTitle }) => (
          <ScrollView
            {...scrollProps}
            contentContainerStyle={{ paddingBottom: t.space.tabBarClearance }}
          >
            {largeTitle}
            {DEMO_ROWS.slice(0, 40).map((row) => (
              <DemoRowView key={row.key} row={row} />
            ))}
          </ScrollView>
        )}
      </RootScreen>
      <View ref={plus} collapsable={false} style={styles.plus}>
        <IconButton
          icon="plus"
          label="Add a booking"
          tone="ink"
          size={60}
          onPress={openMorph}
          testID="premium-shell-morph-plus"
        />
      </View>
    </PlusSheetMorph>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: 12, paddingTop: 8 },
  plus: { position: 'absolute', right: 24, bottom: 120 },
});
