import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';
import { confirmAlert, ZoomLink } from '@/ui/premium/shell';

export const __CP_DEV_ROUTE__ = true;

/** The demo list: the shell's behaviours first, then filler rows to scroll through. */
export interface DemoRow {
  readonly key: string;
  readonly title: string;
  readonly line: string;
  readonly action?: 'zoom' | 'push' | 'sheet' | 'full' | 'alert' | 'add';
}

const BEHAVIOURS: readonly DemoRow[] = [
  { key: 'zoom', title: 'Bali', line: 'Card → headerless page, zoom', action: 'zoom' },
  {
    key: 'push',
    title: 'Push screen',
    line: 'Inline title, glass back, hold to confirm',
    action: 'push',
  },
  {
    key: 'sheet',
    title: 'Sheet with a form',
    line: 'Type, then swipe down: it asks first',
    action: 'sheet',
  },
  { key: 'add', title: 'Half sheet', line: 'Add a booking', action: 'add' },
  { key: 'full', title: 'Full screen', line: '✕ on glass, full brightness', action: 'full' },
  { key: 'alert', title: 'Alert', line: 'Two choices, destructive, Cancel', action: 'alert' },
];

export const DEMO_ROWS: readonly DemoRow[] = [
  ...BEHAVIOURS,
  ...Array.from({ length: 120 }, (_, index) => ({
    key: `row-${index}`,
    title: `Row ${index + 1}`,
    line: 'Scroll down: the tab bar minimises, the title collapses',
  })),
];

function open(action: DemoRow['action']): void {
  switch (action) {
    case 'push':
      router.push('/(dev)/premium-shell/push');
      return;
    case 'sheet':
      router.push('/(dev)/premium-shell/sheet');
      return;
    case 'add':
      router.push('/(dev)/premium-shell/add');
      return;
    case 'full':
      router.push('/(dev)/premium-shell/full');
      return;
    case 'alert':
      void confirmAlert({
        title: 'Remove Ana from the trip?',
        message: 'She keeps her own bookings.',
        confirm: 'Remove',
        cancel: 'Cancel',
      });
      return;
    default:
  }
}

export function DemoRowView({ row }: { readonly row: DemoRow }) {
  const t = usePremiumTheme();
  const face = (
    <View style={[styles.card, { backgroundColor: t.color.card, borderRadius: t.radius.card }]}>
      <Text variant="rowTitle">{row.title}</Text>
      <Text variant="rowText" tone="muted">
        {row.line}
      </Text>
    </View>
  );
  if (row.action === 'zoom') {
    return (
      <View style={styles.cell}>
        <ZoomLink
          href="/(dev)/premium-shell/detail"
          zoomId="demo-trip"
          accessibilityLabel={row.title}
          testID="premium-shell-zoom"
        >
          <View
            style={[styles.hero, { backgroundColor: t.accent.sky, borderRadius: t.radius.hero }]}
          >
            <Text variant="display" color={t.color.onInk}>
              {row.title}
            </Text>
          </View>
        </ZoomLink>
      </View>
    );
  }
  return (
    <View style={styles.cell}>
      {row.action === undefined ? (
        face
      ) : (
        <PressableScale
          testID={`premium-shell-${row.key}`}
          accessibilityLabel={row.title}
          onPress={() => open(row.action)}
        >
          {face}
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { paddingHorizontal: 16, paddingVertical: 5 },
  card: { paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  hero: { height: 220, justifyContent: 'flex-end', padding: 20 },
});

// This module is not a screen, only the demo's rows next to its route files.
export default {};
