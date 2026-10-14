/**
 * Android's tab bar, drawn to match phone 1.04 (the iOS 26 system bar the iPhone shows): a glass
 * bar floating over the page with the four labelled tabs, a lens that slides to the chosen tab,
 * and Tokek's 56 pt circle apart from it on the right. The page runs on under the bar, as on iOS,
 * and a page pushed inside a tab's stack hides it.
 */
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassSurface,
  Icon,
  PressableScale,
  REDUCED_FADE_MS,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
  type PremiumIconName,
} from '../..';
import { SHELL_SIZE } from '../shell-theme';
import { GuideFab, type GuideActions } from './guide-circle';
import type { PremiumTabIcon } from './tab-icons';

/** The bar's height and the room around the lens inside it (1.04). */
const BAR_HEIGHT = 64;
const BAR_PAD = 4;
/** Room between the bar and Tokek's circle. */
const GUIDE_GAP = 10;
/** The bar's foot above the screen's bottom edge, or above the system's navigation bar. */
const BAR_BOTTOM = 26;
const NAV_CLEARANCE = 8;

const GLYPH: Readonly<Record<PremiumTabIcon, PremiumIconName>> = {
  home: 'home',
  trips: 'ticket',
  wallet: 'wallet',
  pass: 'pass',
};

/** Where the bar sits: its foot over the screen's bottom edge and its width beside the guide. */
export function drawnBarFrame(
  screenWidth: number,
  bottomInset: number,
  gutter: number,
): { readonly bottom: number; readonly width: number } {
  return {
    bottom: Math.max(BAR_BOTTOM, bottomInset + NAV_CLEARANCE),
    width: screenWidth - gutter * 2 - SHELL_SIZE.guideCircle - GUIDE_GAP,
  };
}

/** How far above the screen's bottom edge the bar's top sits: the page fades out up to there. */
export function drawnBarTop(bottomInset: number): number {
  return Math.max(BAR_BOTTOM, bottomInset + NAV_CLEARANCE) + BAR_HEIGHT;
}

export interface DrawnTabBarProps extends BottomTabBarProps {
  /** The tab routes in bar order, with their icon and label. */
  readonly tabs: readonly {
    readonly name: string;
    readonly icon: PremiumTabIcon;
    readonly label: string;
  }[];
  readonly guide: GuideActions;
  /** A page pushed inside a tab's stack: no bar, no guide circle. */
  readonly hidden: boolean;
}

export function DrawnTabBar({
  state,
  emitter,
  navigateToTab,
  tabs,
  guide,
  hidden,
}: DrawnTabBarProps) {
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const reduced = usePremiumReducedMotion();
  const frame = drawnBarFrame(screenWidth, insets.bottom, t.space.gutter);
  const item = (frame.width - BAR_PAD * 2) / Math.max(1, tabs.length);
  const focused = state.routes[state.index]?.name;
  const chosen = Math.max(
    0,
    tabs.findIndex((tab) => tab.name === focused),
  );
  const lensX = useSharedValue(chosen * item);
  // The first placement lands the lens where it belongs; later ones slide it there.
  const placed = useRef(false);

  useEffect(() => {
    const to = chosen * item;
    if (!placed.current) {
      lensX.value = to;
      placed.current = true;
      return;
    }
    lensX.value = reduced
      ? withTiming(to, { duration: REDUCED_FADE_MS })
      : withSpring(to, SPRINGS.snappy);
  }, [chosen, item, lensX, reduced]);
  const lens = useAnimatedStyle(() => ({ transform: [{ translateX: lensX.value }] }));

  if (hidden) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.row, { bottom: frame.bottom, left: t.space.gutter, right: t.space.gutter }]}
    >
      <GlassSurface
        kind="regular"
        style={[
          styles.bar,
          { width: frame.width, height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2 },
        ]}
      >
        <View accessibilityRole="tablist" style={styles.items}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.lens,
              {
                width: item,
                height: BAR_HEIGHT - BAR_PAD * 2,
                borderRadius: (BAR_HEIGHT - BAR_PAD * 2) / 2,
                backgroundColor: t.color.control,
              },
              lens,
            ]}
          />
          {tabs.map((tab) => {
            const route = state.routes.find((entry) => entry.name === tab.name);
            if (route === undefined) return null;
            const selected = route.name === focused;
            const color = selected ? t.color.ink : t.color.inkSecondary;
            const press = () => {
              const event = emitter.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!selected && !event.defaultPrevented) navigateToTab(route.key);
            };
            return (
              <PressableScale
                key={route.key}
                onPress={press}
                onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected }}
                testID={`tab-${tab.icon}`}
                style={[styles.item, { width: item }]}
              >
                <Icon name={GLYPH[tab.icon]} size={22} color={color} />
                <Text variant="tier" color={color} numberOfLines={1}>
                  {tab.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </GlassSurface>
      <GuideFab actions={guide} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bar: { padding: BAR_PAD, justifyContent: 'center' },
  items: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  lens: { position: 'absolute', left: 0, top: 0 },
  item: { height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2 },
});
