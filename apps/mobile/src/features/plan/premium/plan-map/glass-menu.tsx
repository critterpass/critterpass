/**
 * A menu on glass (4.29's menu, and the plan map's ⋯): rows of a label with its glyph on the
 * right, hairlines between them, a wider gap before the destructive row, which reads in pink. It
 * grows from its anchor on the Snappy spring (a fade with Reduce Motion); a tap outside closes it.
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

import {
  GlassSurface,
  Icon,
  makePremiumStyles,
  PressableScale,
  REDUCED_FADE_MS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
  type PremiumIconName,
  popIn,
} from '@/ui/premium';
import { useShellExtras } from '@/ui/premium/shell/shell-theme';

export interface GlassMenuItem {
  readonly key: string;
  readonly label: string;
  readonly subtitle?: string;
  readonly icon?: PremiumIconName;
  readonly destructive?: boolean;
  readonly onPress: () => void;
}

export interface GlassMenuProps {
  readonly items: readonly GlassMenuItem[];
  readonly onClose: () => void;
  /** Where the menu's top-left (or top-right with `alignEnd`) sits on screen. */
  readonly anchor: { readonly x: number; readonly y: number };
  readonly alignEnd?: boolean;
  /** Drawn above the menu, lifted (the stop's preview card). */
  readonly preview?: ReactNode;
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

const WIDTH = 250;

const useStyles = makePremiumStyles((t) => ({
  menu: { width: WIDTH, borderRadius: t.radius.banner, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: t.space.gap12,
    paddingHorizontal: t.space.gap16,
    gap: t.space.gap12,
  },
  divider: { borderTopWidth: 0.5, borderTopColor: t.color.hairlineMenu },
  gap: { height: 6, backgroundColor: t.color.hairline },
}));

export function GlassMenu({
  items,
  onClose,
  anchor,
  alignEnd = false,
  preview,
  accessibilityLabel,
  testID = 'glass-menu',
}: GlassMenuProps) {
  const styles = useStyles();
  const t = usePremiumTheme();
  const extras = useShellExtras();
  const reduced = usePremiumReducedMotion();
  const enter = popIn(reduced);
  const position = alignEnd
    ? { right: anchor.x, top: anchor.y }
    : { left: anchor.x, top: anchor.y };
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: extras.scrim }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      />
      <Animated.View
        entering={enter}
        exiting={FadeOut.duration(REDUCED_FADE_MS)}
        style={[{ position: 'absolute', gap: t.space.gap12 }, position]}
        testID={testID}
      >
        {preview}
        <GlassSurface kind="regular" style={styles.menu}>
          {items.map((item, index) => {
            const before = items[index - 1];
            const separated =
              before !== undefined && item.destructive === true && before.destructive !== true;
            return (
              <View key={item.key}>
                {separated ? <View style={styles.gap} /> : null}
                <PressableScale
                  onPress={() => {
                    onClose();
                    item.onPress();
                  }}
                  accessibilityRole="menuitem"
                  accessibilityLabel={item.label}
                  testID={`${testID}-${item.key}`}
                  style={[styles.row, index === 0 || separated ? null : styles.divider]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      variant="field"
                      color={item.destructive === true ? t.color.destructive.text : undefined}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    {item.subtitle === undefined ? null : (
                      <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    )}
                  </View>
                  {item.icon === undefined ? null : (
                    <Icon
                      name={item.icon}
                      size={20}
                      color={item.destructive === true ? t.color.destructive.text : t.color.ink}
                    />
                  )}
                </PressableScale>
              </View>
            );
          })}
        </GlassSurface>
      </Animated.View>
    </Modal>
  );
}
