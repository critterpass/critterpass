/**
 * A menu on glass (4.29's menu, and the plan map's ⋯): rows of a label with its glyph on the
 * right, hairlines between them, a wider gap before the destructive row, which reads in pink. It
 * grows from its anchor on the Snappy spring (a fade with Reduce Motion); a tap outside closes it.
 * A lifted card (`lift`) rises where the thing held was, its menu under it, both moved up only as
 * far as the screen needs. A row's action runs once the menu has gone (`useMenuChoice`).
 */
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassSurface,
  Icon,
  makePremiumStyles,
  PressableScale,
  Text,
  reducedFadeOut,
  usePremiumReducedMotion,
  usePremiumTheme,
  type PremiumIconName,
  popIn,
} from '@/ui/premium';
import { useShellExtras } from '@/ui/premium/shell/shell-theme';

import { liftedTop, useMenuChoice, type LiftRect } from './menu-choice';

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
  /**
   * Lift the preview where the held thing sits on screen (`from`, in window points), or at
   * `fallback` from the top when it has no place there; `anchor.x` still sets the left edge.
   */
  readonly lift?: { readonly from: LiftRect | null; readonly fallback: number };
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

const WIDTH = 250;

const useStyles = makePremiumStyles((t) => ({
  group: { position: 'absolute', gap: t.space.gap12 },
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
  lift,
  accessibilityLabel,
  testID = 'glass-menu',
}: GlassMenuProps) {
  const styles = useStyles();
  const t = usePremiumTheme();
  const extras = useShellExtras();
  const reduced = usePremiumReducedMotion();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const choice = useMenuChoice(onClose);
  // A lifted card waits one layout to learn its height, then rises in place.
  const [groupHeight, setGroupHeight] = useState<number | null>(null);
  const enter = popIn(reduced);
  const top =
    lift === undefined
      ? anchor.y
      : liftedTop({
          from: lift.from,
          groupHeight: groupHeight ?? 0,
          screenHeight,
          top: insets.top + t.space.gap8,
          bottom: insets.bottom + t.space.gap16,
          fallback: lift.fallback,
        });
  const position = alignEnd ? { right: anchor.x, top } : { left: anchor.x, top };
  const group = (
    <>
      {preview}
      {/* Opaque, as the sheet material is: the iOS glass let the stop under it read through. */}
      <GlassSurface kind="sheet" style={styles.menu}>
        {items.map((item, index) => {
          const before = items[index - 1];
          const separated =
            before !== undefined && item.destructive === true && before.destructive !== true;
          return (
            <View key={item.key}>
              {separated ? <View style={styles.gap} /> : null}
              <PressableScale
                onPress={() => choice.choose(item.onPress)}
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
    </>
  );
  const measuring = lift !== undefined && groupHeight === null;
  return (
    <Modal
      transparent
      visible={choice.open}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={choice.dismiss}
      onDismiss={choice.dismissed}
    >
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: extras.scrim }]}
        onPress={choice.dismiss}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      />
      {measuring ? (
        <View
          pointerEvents="none"
          style={[styles.group, { opacity: 0 }, position]}
          onLayout={(event) => setGroupHeight(event.nativeEvent.layout.height)}
        >
          {group}
        </View>
      ) : (
        <Animated.View
          entering={enter}
          exiting={reducedFadeOut()}
          style={[styles.group, position]}
          testID={testID}
        >
          {group}
        </Animated.View>
      )}
    </Modal>
  );
}
