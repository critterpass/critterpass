import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, usePremiumTheme } from '../..';

export interface HeaderBarProps {
  /** The leading control (the glass back or ✕); nothing keeps its side empty. */
  readonly leading?: ReactNode;
  /** The centred title (19/700). */
  readonly title: string;
  /** The muted line under it (12/400). */
  readonly subtitle?: string;
  /** The trailing action (a glass circle, a labelled glass pill). */
  readonly trailing?: ReactNode;
  readonly testID?: string;
}

/** The centred title and subtitle of a bar, one line each. */
export function HeaderTitle({
  title,
  subtitle,
}: {
  readonly title: string;
  readonly subtitle?: string | undefined;
}) {
  return (
    <View style={styles.title}>
      <Text variant="navTitle" numberOfLines={1} align="center" accessibilityRole="header">
        {title}
      </Text>
      {subtitle === undefined ? null : (
        <Text variant="navSubtitle" tone="muted" numberOfLines={1} align="center">
          {subtitle}
        </Text>
      )}
    </View>
  );
}

/**
 * A drawn header row: the leading control, the title centred on the screen, the trailing action.
 * Both sides take the same share of the row, so a wide "Map" pill beside a 44 back never pushes
 * the title off the screen's centre. It sits where its parent puts it (below the status bar).
 */
export function HeaderBar({ leading, title, subtitle, trailing, testID }: HeaderBarProps) {
  const t = usePremiumTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.row,
        { minHeight: t.size.glassNav, paddingHorizontal: t.space.gutter, gap: t.space.gap8 },
      ]}
    >
      <View style={styles.side}>{leading}</View>
      <HeaderTitle title={title} subtitle={subtitle} />
      <View style={[styles.side, styles.end]}>{trailing}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // Equal sides keep the title centred whatever the two sides' widths.
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  end: { justifyContent: 'flex-end' },
  title: { alignItems: 'center', maxWidth: 240, flexShrink: 1 },
});
