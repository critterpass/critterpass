/**
 * A sheet's header row (journeys 03 Edit crew, 04 New poll, 07 Add by hand, 09 Save): the glass ✕
 * (or the glass back for a page pushed inside a sheet) on the left, the centred 17/600 title with
 * its muted line, and the verb as the ink pill on the right. Both sides take the same share of the
 * row, so the title stays on the sheet's centre whatever the words' widths ("Hủy" / "Lưu").
 * `SheetScreen` draws it; a sheet that lays out its own frame puts it at its top.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { GlassIconButton, HeaderPill, Text, usePremiumTheme, type HeaderPillProps } from '../..';

export interface SheetHeaderProps {
  /** `close` (✕) for a sheet's first screen, `back` for a page pushed inside it. */
  readonly leading?: 'close' | 'back' | 'none';
  /** What the ✕ or back says ("Cancel", "Close"). */
  readonly leadingLabel: string;
  readonly onLeading: () => void;
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
  /** The verb's ink pill ("Save", "Done"). */
  readonly verb?: HeaderPillProps | undefined;
  /** Something else on the right instead of a verb (a glass pill such as "Restore"). */
  readonly trailing?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly leadingTestID?: string;
}

export function SheetHeader({
  leading = 'close',
  leadingLabel,
  onLeading,
  title,
  subtitle,
  verb,
  trailing,
  style,
  leadingTestID = 'sheet-cancel',
}: SheetHeaderProps) {
  const t = usePremiumTheme();
  return (
    <View
      collapsable={false}
      style={[styles.row, { paddingHorizontal: t.space.gutter, gap: t.space.gap12 }, style]}
    >
      <View style={styles.side}>
        {leading === 'none' ? null : (
          <GlassIconButton
            icon={leading}
            label={leadingLabel}
            onPress={onLeading}
            testID={leadingTestID}
          />
        )}
      </View>
      <View style={styles.title}>
        {title === undefined ? null : (
          <Text variant="button" accessibilityRole="header" numberOfLines={1} align="center">
            {title}
          </Text>
        )}
        {subtitle === undefined ? null : (
          <Text variant="caption" tone="muted" numberOfLines={1} align="center">
            {subtitle}
          </Text>
        )}
      </View>
      <View style={[styles.side, styles.end]}>
        {verb === undefined ? (trailing ?? null) : <HeaderPill {...verb} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 56, flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  end: { justifyContent: 'flex-end' },
  title: { flexShrink: 1, maxWidth: '60%' },
});
