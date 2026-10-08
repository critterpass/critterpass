jest.unmock('expo-router');

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Slot, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import type * as ReactNativeModule from 'react-native';
import type { ViewStyle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Metrics } from 'react-native-safe-area-context';

import { tokens } from '@cp/design-tokens';

import { provideSessionGate } from '../../../lib/navigation/gates';
import { registerScreens } from '../../../lib/navigation/screen-registry';
import { tabTransition } from '../../../lib/navigation/transitions';
import { KeyboardFooter } from '../../layout/KeyboardFooter';
import { ThemeProvider } from '../../../lib/theme';
import { FAB_RAISE } from '../GuideFab';
import { ShellTabs } from '../ShellTabs';
import { TAB_BAR_CONTENT_HEIGHT } from '../TabBar';
import { TAB_BAR_CLEARANCE } from '../tab-bar-metrics';

// Imported last on purpose: the testing library registers its own Reanimated mock (the package's
// `/mock`, which cannot load under this app's Jest setup, see jest.config.js). Every module above
// has already loaded the app's own Reanimated double by then, so nothing picks up the other one.
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

// `<Sticker>` rasterises critter art through Skia's JSI/GPU host, which Jest cannot run; its own
// suite covers the real pipeline against canvaskit-wasm. Here it is a plain view carrying its props.
jest.mock('../../sticker/Sticker', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot close over module-scope imports
  const RN = require('react-native') as typeof ReactNativeModule;
  return {
    Sticker: ({ kind, maskColor }: { kind: string; maskColor?: string }) => (
      <RN.View testID={`sticker-${kind}`} accessibilityHint={maskColor} />
    ),
  };
});

const GESTURE_NAV: Metrics = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 32, left: 0, right: 0, bottom: 24 },
};
const THREE_BUTTON_NAV: Metrics = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 32, left: 0, right: 0, bottom: 48 },
};

/** Decorative art is hidden from assistive tech, so queries must opt in to see it. */
const HIDDEN = { includeHiddenElements: true };

let fontScale = 1;
let metrics: Metrics = GESTURE_NAV;

function TestRoot() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={metrics}>
        <I18nProvider i18n={i18n}>
          <ThemeProvider fontScale={fontScale}>
            <Slot />
          </ThemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function screenNamed(name: string) {
  return function NamedScreen() {
    return <Text>{`${name} screen`}</Text>;
  };
}

/** The guide sheet's stand-in: it shows the trip it was opened for. */
function GuideScreen() {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  return <Text>{`guide screen for ${tripId ?? 'no trip'}`}</Text>;
}

function TripsWithBadge() {
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ tabBarBadge: 3 });
  }, [navigation]);
  return <Text>trips screen</Text>;
}

function footerScreen(testID: string) {
  return function FooterScreen() {
    return (
      <KeyboardFooter testID={testID}>
        <Text>save</Text>
      </KeyboardFooter>
    );
  };
}

const ROUTES = {
  _layout: TestRoot,
  '(tabs)/_layout': ShellTabs,
  '(tabs)/index': screenNamed('home'),
  '(tabs)/trips': TripsWithBadge,
  '(tabs)/wallet': screenNamed('wallet'),
  '(tabs)/pass': footerScreen('tab-footer'),
  guide: GuideScreen,
  help: footerScreen('stack-footer'),
  welcome: screenNamed('welcome'),
};

async function renderShell(initialUrl = '/') {
  // `renderRouter` returns RNTL's render promise with the router helpers attached to it.
  const pending = renderRouter(ROUTES, { initialUrl });
  const rendered = await pending;
  await act(async () => {});
  return { getPathname: () => pending.getPathname(), unmount: () => rendered.unmount() };
}

function flat(element: { props: { style?: unknown } }): ViewStyle {
  return StyleSheet.flatten(element.props.style as ViewStyle) ?? {};
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

afterEach(() => {
  fontScale = 1;
  metrics = GESTURE_NAV;
  provideSessionGate(() => ({ status: 'ready' }));
});

describe('TabBar', () => {
  it('switches tabs on press', async () => {
    const shell = await renderShell();
    await fireEvent.press(screen.getByTestId('tab-wallet'));
    expect(shell.getPathname()).toBe('/wallet');
    expect(screen.getByTestId('tab-wallet').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByText('wallet screen')).toBeTruthy();
  });

  it('shows a badge set by the tab screen', async () => {
    await renderShell();
    await fireEvent.press(screen.getByTestId('tab-trips'));
    expect(screen.getByTestId('tab-trips-badge', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('tab-trips').props.accessibilityLabel).toBe('Trips, 3 new');
  });

  it('hides labels at the largest text sizes and offers the large-content viewer', async () => {
    fontScale = 2;
    await renderShell();
    expect(screen.queryByText('HOME')).toBeNull();
    const home = screen.getByTestId('tab-home');
    expect(home.props.accessibilityShowsLargeContentViewer).toBe(true);
    expect(home.props.accessibilityLargeContentTitle).toBe('Home');
    expect(home.props.accessibilityLabel).toBe('Home');
  });

  it.each([
    ['gesture navigation', GESTURE_NAV],
    ['3-button navigation', THREE_BUTTON_NAV],
  ])('keeps the bar and FAB clear of the Android nav bar under %s', async (_name, nav) => {
    metrics = nav;
    await renderShell();
    const inset = nav.insets.bottom;
    const bar = flat(screen.getByTestId('tab-bar'));
    expect(bar.height).toBe(TAB_BAR_CONTENT_HEIGHT + inset);
    expect(bar.paddingBottom).toBe(inset);
    const container = flat(screen.getByTestId('tab-bar-container'));
    expect(container.height).toBe(TAB_BAR_CONTENT_HEIGHT + inset - FAB_RAISE);
    const fabBottom = flat(screen.getByTestId('guide-fab')).height ?? 0;
    // The FAB hangs from the container's top edge, so it ends above the inset band.
    expect(fabBottom).toBeLessThanOrEqual((container.height as number) - inset);
  });
});

describe('KeyboardFooter in a tab', () => {
  it('sits above the tab bar and its FAB inside a tab, and above the home inset elsewhere', async () => {
    const unregister = registerScreens({ '3k-6': '/help' });
    const shell = await renderShell();
    const home = GESTURE_NAV.insets.bottom;
    const gap = tokens.space['8'];
    await fireEvent.press(screen.getByTestId('tab-pass'));
    const tabFooter = flat(screen.getByTestId('tab-footer'));
    expect(tabFooter.paddingBottom).toBe(home + TAB_BAR_CLEARANCE + gap);
    expect(TAB_BAR_CLEARANCE).toBe(TAB_BAR_CONTENT_HEIGHT - FAB_RAISE);

    await fireEvent(screen.getByTestId('guide-fab'), 'accessibilityAction', {
      nativeEvent: { actionName: 'longpress' },
    });
    expect(shell.getPathname()).toBe('/help');
    expect(flat(screen.getByTestId('stack-footer')).paddingBottom).toBe(home + gap);
    unregister();
  });
});

describe('GuideFab', () => {
  it('shows the default guide and no actions while its routes are unregistered', async () => {
    await renderShell();
    const fab = screen.getByTestId('guide-fab');
    expect(fab.props.accessibilityRole).toBe('image');
    expect(fab.props.accessibilityLabel).toBe('Tokek');
    expect(fab.props.accessibilityActions).toEqual([]);
    expect(screen.getByTestId('sticker-gecko', HIDDEN)).toBeTruthy();
  });

  it('asks the guide on tap and opens Help on long-press once registered', async () => {
    const unregister = registerScreens({ '3j-1': '/guide', '3k-6': '/help' });
    const shell = await renderShell();
    const fab = screen.getByTestId('guide-fab');
    expect(fab.props.accessibilityRole).toBe('button');
    expect(fab.props.accessibilityLabel).toBe('Ask Tokek');
    const actions = fab.props.accessibilityActions as { label: string }[];
    expect(actions.map((action) => action.label)).toEqual(['Ask Tokek', 'Get help']);

    await fireEvent(fab, 'accessibilityAction', { nativeEvent: { actionName: 'longpress' } });
    expect(shell.getPathname()).toBe('/help');

    await act(() => shell.unmount());
    const again = await renderShell();
    await fireEvent(screen.getByTestId('guide-fab'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(again.getPathname()).toBe('/guide');
    unregister();
  });

  it('asks about the trip on screen, and about no trip in particular elsewhere', async () => {
    const unregister = registerScreens({
      '3j-1': (params) => ({ pathname: '/guide', params }),
    });
    const onTrip = await renderShell('/trips?tripId=trip-b');
    await fireEvent(screen.getByTestId('guide-fab'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(screen.getByText('guide screen for trip-b')).toBeTruthy();

    await act(() => onTrip.unmount());
    await renderShell('/');
    await fireEvent(screen.getByTestId('guide-fab'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(screen.getByText('guide screen for no trip')).toBeTruthy();
    unregister();
  });
});

describe('session gate', () => {
  it('sends signed-out sessions to onboarding once it is registered', async () => {
    provideSessionGate(() => ({ status: 'signedOut' }));
    const unregister = registerScreens({ '3a-1': '/welcome' });
    const shell = await renderShell();
    expect(shell.getPathname()).toBe('/welcome');
    unregister();
  });

  it('lets signed-out sessions through while onboarding is unregistered', async () => {
    provideSessionGate(() => ({ status: 'signedOut' }));
    await renderShell();
    expect(screen.getByText('home screen')).toBeTruthy();
  });
});

/** Reads an interpolation's current value (Animated's own internal accessor, stable since RN 0.4x). */
function valueOf(node: unknown): number {
  return (node as { __getValue(): number }).__getValue();
}

describe('tab transition', () => {
  const { motion } = tokens;

  it('cross-fades for 200 ms under reduced motion', () => {
    const options = tabTransition(motion, true);
    const fadeMs = 200;
    expect(options.transitionSpec).toMatchObject({ config: { duration: fadeMs } });
    const progress = new Animated.Value(0.5);
    const style = options.sceneStyleInterpolator?.({ current: { progress } }).sceneStyle as {
      opacity: Animated.AnimatedInterpolation<number>;
      transform?: unknown;
    };
    expect(valueOf(style.opacity)).toBe(0.5);
    expect(style.transform).toBeUndefined();
  });
});
