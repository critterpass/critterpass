import { useLingui } from '@lingui/react/macro';
import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { Platform, StyleSheet, View } from 'react-native';

import { useGateDecision } from '@/lib/navigation/gates';

import { usePremiumTheme } from '../..';
import { GuideFab, useGuideActions } from './guide-circle';
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
}

/**
 * The premium tab bar: the system bar. On iOS 26 that is the Liquid Glass bar with the sliding lens
 * that minimises to the active tab's icon while content scrolls down, and Tokek as the separate
 * search-role circle on the right; selecting it is refused natively, and its press opens the guide
 * sheet instead of a tab. On Android it is the Material bottom bar, with the guide as a floating
 * button above it.
 */
export function PremiumTabs({
  gated = true,
  tabs,
  guideRoute = GUIDE_TRIGGER_ROUTE,
}: PremiumTabsProps) {
  const { t } = useLingui();
  const decision = useGateDecision();
  const { color } = usePremiumTheme();
  const guide = useGuideActions();

  if (gated && decision.kind === 'wait') return null;
  if (gated && decision.kind === 'redirect') return <Redirect href={decision.href} />;

  const labels: Record<PremiumTabIcon, string> = {
    home: t({ id: 'common.shell.tabHome', message: 'Home' }),
    trips: t({ id: 'common.shell.tabTrips', message: 'Trips' }),
    wallet: t({ id: 'common.shell.tabWallet', message: 'Wallet' }),
    pass: t({ id: 'common.shell.tabPass', message: 'Pass' }),
  };
  const items = tabs ?? PREMIUM_TABS.map((tab) => ({ ...tab, label: labels[tab.icon] }));
  const guideName = 'Tokek';
  const ios = Platform.OS === 'ios';

  return (
    <View style={styles.root}>
      <NativeTabs
        minimizeBehavior="onScrollDown"
        tintColor={color.ink}
        iconColor={{ default: color.muted, selected: color.ink }}
        indicatorColor={color.control}
        {...(Platform.OS === 'android' ? { backgroundColor: color.card } : {})}
        labelVisibilityMode="labeled"
      >
        {items.map((tab) => (
          <NativeTabs.Trigger key={tab.name} name={tab.name} testID={`tab-${tab.icon}`}>
            <NativeTabs.Trigger.Icon src={TAB_ICONS[tab.icon]} renderingMode="template" />
            <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
        <NativeTabs.Trigger
          name={guideRoute}
          role="search"
          disabled
          hidden={!ios || guide.ask === undefined}
          testID="guide-circle"
          accessibilityLabel={t({ id: 'common.shell.fabAsk', message: `Ask ${guideName}` })}
          listeners={{ tabPress: () => guide.ask?.() }}
        >
          <NativeTabs.Trigger.Icon src={GUIDE_TAB_IMAGE} renderingMode="original" />
        </NativeTabs.Trigger>
      </NativeTabs>
      {ios ? null : <GuideFab actions={guide} />}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
