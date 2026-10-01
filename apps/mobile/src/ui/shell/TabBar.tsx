import { useLingui } from '@lingui/react/macro';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, Pressable, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeSettings } from '@/lib/theme';
import { impact } from '@/motion/feedback';
import { toast } from '@/motion/island-toast';

import { Text } from '../text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';
import { FAB_RAISE, FAB_RING, FAB_SIZE, GuideFab } from './GuideFab';
import type { TabIconKind } from './TabIcon';
import { TabIcon } from './TabIcon';
import { TAB_BAR_CONTENT_HEIGHT } from './tab-bar-metrics';

/** Tab route names (files under `app/(tabs)/`, created by the home/trips/wallet/pass areas). */
export type TabRouteName = 'index' | 'trips' | 'wallet' | 'pass';

interface TabSlot {
  readonly route: TabRouteName;
  readonly icon: TabIconKind;
  readonly testID: string;
}

const LEFT_SLOTS: readonly TabSlot[] = [
  { route: 'index', icon: 'pin', testID: 'tab-home' },
  { route: 'trips', icon: 'ticket', testID: 'tab-trips' },
];
const RIGHT_SLOTS: readonly TabSlot[] = [
  { route: 'wallet', icon: 'wallet', testID: 'tab-wallet' },
  { route: 'pass', icon: 'egg', testID: 'tab-pass' },
];

/** Declared by the tabs layout in bar order (expo-router shows only declared tab screens). */
export const TAB_ROUTES: readonly TabRouteName[] = [...LEFT_SLOTS, ...RIGHT_SLOTS].map(
  (slot) => slot.route,
);

export { TAB_BAR_CONTENT_HEIGHT };

/** Labels hide from AX1 up (iOS large-content viewer pattern); below that they shrink to 9 pt. */
export const LABEL_HIDE_FONT_SCALE = 1.6;
const LABEL_MIN_SIZE = 9;

type TabRoute = BottomTabBarProps['state']['routes'][number];

const useStyles = makeStyles((t) => ({
  bar: {
    backgroundColor: t.semantic.bg.sunken,
    borderTopWidth: 1,
    borderTopColor: t.color.divider,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  slot: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space['4'],
  },
  // The label spans its slot, so it is fitted to the slot's width rather than to its own: a short
  // word of narrow letters ("VÍ") measured against itself would shrink to the floor.
  label: { alignSelf: 'stretch', textAlign: 'center' },
  container: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  fabSlot: { width: FAB_SIZE + 2 * FAB_RING },
  fabLayer: { position: 'absolute', top: 0, start: 0, end: 0, alignItems: 'center' },
  badge: { position: 'absolute', top: t.space['4'], start: '55%' },
  count: {
    minWidth: t.space['20'],
    height: t.space['20'],
    paddingHorizontal: t.space['4'],
    borderRadius: t.space['10'],
    backgroundColor: t.semantic.state.urgent,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

/** Pink count badge shared by the tab bar and the home header (decorative; labels carry the count). */
export function ShellBadge({
  count,
  testID,
  style,
}: {
  readonly count: string | number;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.count, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text variant="label" color={theme.semantic.text.onAccent}>
        {String(count)}
      </Text>
    </View>
  );
}

function TabButton({
  slot,
  route,
  focused,
  badge,
  showLabel,
  emitter,
  navigateToTab,
}: {
  readonly slot: TabSlot;
  readonly route: TabRoute;
  readonly focused: boolean;
  readonly badge: string | number | undefined;
  readonly showLabel: boolean;
  readonly emitter: BottomTabBarProps['emitter'];
  readonly navigateToTab: BottomTabBarProps['navigateToTab'];
}) {
  const { t } = useLingui();
  const theme = useTheme();
  const styles = useStyles();
  const labels: Record<TabRouteName, string> = {
    index: t({ id: 'common.shell.tabHome', message: 'Home' }),
    trips: t({ id: 'common.shell.tabTrips', message: 'Trips' }),
    wallet: t({ id: 'common.shell.tabWallet', message: 'Wallet' }),
    pass: t({ id: 'common.shell.tabPass', message: 'Pass' }),
  };
  const label = labels[slot.route];
  const color = focused ? theme.semantic.action.primary : theme.color.ink['300'];
  const count = badge;
  const a11yLabel =
    count === undefined
      ? label
      : t({ id: 'common.shell.tabBadge', message: `${label}, ${count} new` });

  const onPress = () => {
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      impact('snap');
      navigateToTab(route.key);
    }
  };
  const onLongPress = () => {
    emitter.emit({ type: 'tabLongPress', target: route.key });
    // Android has no large-content viewer: the hidden label is shown as a toast instead.
    if (!showLabel && Platform.OS === 'android') {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- toast de-dupe key, never rendered
      toast.show({ id: `tab-${slot.route}`, title: label });
    }
  };

  return (
    <Pressable
      testID={slot.testID}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={a11yLabel}
      accessibilityShowsLargeContentViewer={!showLabel}
      accessibilityLargeContentTitle={label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.slot}
    >
      <TabIcon kind={slot.icon} color={color} focused={focused} />
      {showLabel ? (
        <Text
          variant="label"
          color={color}
          autoFit
          autoFitMinSize={LABEL_MIN_SIZE}
          numberOfLines={1}
          style={styles.label}
        >
          {label}
        </Text>
      ) : null}
      {count !== undefined ? (
        <ShellBadge count={count} testID={`${slot.testID}-badge`} style={styles.badge} />
      ) : null}
    </Pressable>
  );
}

/**
 * The custom 5-slot bar: HOME · TRIPS · guide FAB · WALLET · PASS. Keeps the design height above
 * the device's bottom inset; missing tab routes leave their slot empty so the FAB stays centred.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { fontScale } = useThemeSettings();
  const showLabel = fontScale < LABEL_HIDE_FONT_SCALE;
  const focusedKey = state.routes[state.index]?.key;

  const renderSlot = (slot: TabSlot) => {
    const route = state.routes.find((entry) => entry.name === slot.route);
    if (!route) return <View key={slot.route} style={styles.slot} />;
    return (
      <TabButton
        key={slot.route}
        slot={slot}
        route={route}
        focused={route.key === focusedKey}
        badge={descriptors[route.key]?.options.tabBarBadge}
        showLabel={showLabel}
        emitter={emitter}
        navigateToTab={navigateToTab}
      />
    );
  };

  const barHeight = TAB_BAR_CONTENT_HEIGHT + insets.bottom;

  // Floats over the scene (screens pad with `useTabBarInset`) and reserves the FAB's raised band
  // inside its own bounds: Android never delivers touches outside a parent's frame.
  return (
    <View
      testID="tab-bar-container"
      pointerEvents="box-none"
      style={[styles.container, { height: barHeight - FAB_RAISE }]}
    >
      <View
        testID="tab-bar"
        accessibilityRole="tablist"
        style={[
          styles.bar,
          { height: barHeight, paddingBottom: insets.bottom, marginTop: -FAB_RAISE },
        ]}
      >
        {LEFT_SLOTS.map(renderSlot)}
        <View style={styles.fabSlot} />
        {RIGHT_SLOTS.map(renderSlot)}
      </View>
      <View pointerEvents="box-none" style={styles.fabLayer}>
        <GuideFab />
      </View>
    </View>
  );
}

/** Bottom padding a tab screen's scroll content needs to end above the bar and the device inset. */
export function useTabBarInset(): number {
  return TAB_BAR_CONTENT_HEIGHT + useSafeAreaInsets().bottom;
}
