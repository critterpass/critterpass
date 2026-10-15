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

/** A pill the design sets on the back's row ("Only you see this"), and where on it. */
export interface BarBadge {
  readonly node: ReactNode;
  /** `end`: at the row's end (4.22); `centre`: centred on the screen (4.47). */
  readonly align: 'end' | 'centre';
}

/**
 * A crumb page's bar (7.13, 6.19): the glass back, the page it returns to beside it in the muted
 * line ("Bookings"), the trailing action; the page's large title sits under it. A page with a badge
 * on that row (a private draft's lock pill) shows the badge there instead of the crumb.
 */
export function CrumbBar({
  top,
  leading,
  crumb,
  trailing,
  badge,
}: {
  readonly top: number;
  readonly leading: ReactNode;
  readonly crumb: string | null;
  readonly trailing: ReactNode;
  readonly badge?: BarBadge | undefined;
}) {
  const t = usePremiumTheme();
  let middle: ReactNode;
  if (badge?.align === 'end') middle = <View style={[styles.grow, styles.end]}>{badge.node}</View>;
  else if (badge !== undefined || crumb === null) middle = <View style={styles.grow} />;
  else {
    middle = (
      <Text variant="rowText" tone="muted" numberOfLines={1} style={styles.grow}>
        {crumb}
      </Text>
    );
  }
  return (
    <View
      style={[
        styles.row,
        {
          marginTop: top,
          minHeight: t.size.glassNav,
          paddingHorizontal: t.space.gutter,
          gap: t.space.gap12,
        },
      ]}
    >
      {leading}
      {middle}
      {trailing}
      {badge?.align === 'centre' ? (
        <View pointerEvents="box-none" style={styles.centred}>
          {badge.node}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  // Equal sides keep the title centred whatever the two sides' widths.
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  end: { flexDirection: 'row', justifyContent: 'flex-end' },
  // Centred on the screen whatever the two sides hold.
  centred: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  title: { alignItems: 'center', maxWidth: 240, flexShrink: 1 },
});
