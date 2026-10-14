import { useLingui } from '@lingui/react/macro';
import { Redirect, useRootNavigationState } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { NativeTabs } from 'expo-router/native-tabs';
import { Platform, StyleSheet, View } from 'react-native';

import { useGateDecision } from '@/lib/navigation/gates';
import { tabBarHidden, tabSheetUp } from '@/lib/navigation/tab-bar';

import { usePremiumTheme } from '../..';
import { DrawnTabBar } from './drawn-tab-bar';
import { useGuideActions, type GuideActions } from './guide-circle';
import { focusedPath, useTabBarHiddenAfterMoves } from './tab-bar-after-push';
import { GUIDE_TAB_IMAGE, TAB_ICONS, type PremiumTabIcon } from './tab-icons';

/** The tab routes in bar order, with the route file each one is. */
export const PREMIUM_TABS: readonly { readonly name: string; readonly icon: PremiumTabIcon }[] = [
  { name: 'index', icon: 'home' },
  { name: 'trips', icon: 'trips' },
  { name: 'wallet', icon: 'wallet' },
  { name: 'pass', icon: 'pass' },
];

/** The route file behind the guide circle: never shown, its trigger opens the guide sheet. */
export const GUIDE_TRIGGER_ROUTE = 'guide-circle';

export interface PremiumTabsProps {
  /** Session gate on (the app's tabs); off for the Developer tools demo. */
  readonly gated?: boolean;
  /** The tab routes; the app's four unless a demo brings its own. */
  readonly tabs?: readonly {
    readonly name: string;
    readonly icon: PremiumTabIcon;
    readonly label: string;
  }[];
  /** The route file behind the guide circle. */
  readonly guideRoute?: string;
  /** What the guide circle does; the app's guide sheet and Help unless a demo brings its own. */
  readonly guide?: GuideActions;
}

/**
 * The premium tab bar (phone 1.04). On iOS 26 it is the system's Liquid Glass bar with the sliding
 * lens that minimises to the active tab's icon while content scrolls down, and Tokek as the
 * separate search-role circle on the right; selecting it is refused natively, and its press opens
 * the guide sheet instead of a tab. Android's system bar is a flat Material one, so there the shell
 * draws the same bar itself (`./drawn-tab-bar`). A page pushed inside a tab's stack hides the bar
 * (`lib/navigation/tab-bar.ts`).
 */
export function PremiumTabs({
  gated = true,
  tabs,
  guideRoute = GUIDE_TRIGGER_ROUTE,
  guide: guideOverride,
}: PremiumTabsProps) {
  const { t } = useLingui();
  const decision = useGateDecision();
  const { color } = usePremiumTheme();
  const appGuide = useGuideActions();
  const actions = guideOverride ?? appGuide;
  // A page pushed inside a tab's stack has no tab bar (nor Android's guide button over it).
  const rootState = useRootNavigationState();
  const pushed = tabBarHidden(rootState);
  // Android's drawn bar would draw over a tab's sheet (the iPhone's sits under it by itself).
  const sheetUp = tabSheetUp(rootState);
  // The iPhone's system bar comes back as a move inside a tab lands, so it hides after each one.
  const hiddenOnIos = useTabBarHiddenAfterMoves(pushed, focusedPath(rootState));

  if (gated && decision.kind === 'wait') return null;
  if (gated && decision.kind === 'redirect') return <Redirect href={decision.href} />;

  const labels: Record<PremiumTabIcon, string> = {
    home: t({ id: 'common.shell.tabHome', message: 'Home' }),
    trips: t({ id: 'common.shell.tabTrips', message: 'Trips' }),
    wallet: t({ id: 'common.shell.tabWallet', message: 'Wallet' }),
    pass: t({ id: 'common.shell.tabPass', message: 'Pass' }),
  };
  const items = tabs ?? PREMIUM_TABS.map((tab) => ({ ...tab, label: labels[tab.icon] }));
  // Named as in the guide button's message (same id), so the catalog's `{guide}` gets its value.
  const guide = 'Tokek';
  const ios = Platform.OS === 'ios';

  if (!ios) {
    return (
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.ground } }}
        tabBar={(props) => (
          <DrawnTabBar {...props} tabs={items} guide={actions} hidden={pushed || sheetUp} />
        )}
      >
        {items.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
        ))}
        <Tabs.Screen name={guideRoute} options={{ href: null }} />
      </Tabs>
    );
  }

  return (
    <View style={styles.root}>
      <NativeTabs
        minimizeBehavior="onScrollDown"
        tintColor={color.ink}
        iconColor={{ default: color.inkSecondary, selected: color.ink }}
        indicatorColor={color.control}
        labelVisibilityMode="labeled"
        hidden={hiddenOnIos}
      >
        {items.map((tab) => (
          <NativeTabs.Trigger
            key={tab.name}
            name={tab.name}
            // Every tab page lays out its own insets (the drawn title under the status bar, the
            // room above the bar). The tab turned a page's `never` back to `automatic`, which set
            // a root page's title a row below its actions.
            disableAutomaticContentInsets
            testID={`tab-${tab.icon}`}
          >
            <NativeTabs.Trigger.Icon src={TAB_ICONS[tab.icon]} renderingMode="template" />
            <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
        <NativeTabs.Trigger
          name={guideRoute}
          role="search"
          disabled
          hidden={actions.ask === undefined}
          testID="guide-circle"
          accessibilityLabel={t({ id: 'common.shell.fabAsk', message: `Ask ${guide}` })}
          listeners={{ tabPress: () => actions.ask?.() }}
        >
          <NativeTabs.Trigger.Icon src={GUIDE_TAB_IMAGE} renderingMode="original" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
