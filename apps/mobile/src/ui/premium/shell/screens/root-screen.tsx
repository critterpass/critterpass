import { Stack } from 'expo-router';
import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNoBackByDesign } from '@/lib/qa/back-affordance';

import { GlassSurface, kitType, reducedFadeIn, reducedFadeOut, Text, usePremiumTheme } from '../..';
import {
  capActions,
  DrawnHeaderActions,
  NativeHeaderActions,
  type ShellAction,
} from './header-actions';
import { useScreenPlacement } from '../navigation/use-screen-placement';
import { SCROLL_EDGE_FADE, ScrollEdgeFade, useScrollEdges } from './scroll-edge';
import { TabBarFade } from './tab-page-scroll';

/** Spread on the screen's scroll view or list, which must be the screen's first child. */
export interface RootScrollProps {
  readonly contentInsetAdjustmentBehavior?: 'automatic' | 'never';
  readonly automaticallyAdjustContentInsets?: boolean;
  /** A tap on a row while the keyboard is up acts on the row (a search list), not only closes it. */
  readonly keyboardShouldPersistTaps: 'handled';
  readonly keyboardDismissMode: 'interactive' | 'on-drag';
  readonly onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Where the content ends against the tab bar (the fade under it follows). */
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly onContentSizeChange?: (width: number, height: number) => void;
  readonly scrollEventThrottle?: number;
}

export interface RootScrollBindings {
  readonly scrollProps: RootScrollProps;
  /** The large title as the list's first item where the shell draws it; null under the native bar. */
  readonly largeTitle: ReactElement | null;
}

export interface RootScreenProps {
  /** The large title ("Trips", "Wallet"). */
  readonly title: string;
  /** At most two; `primary` marks the ink `+`, which goes last. */
  readonly actions?: readonly ShellAction[];
  /**
   * `drawn`: the shell draws the title on the row of its actions, as the design sets every root
   * (1.04, 7.01), and the bar it collapses into. `native`: the iOS large title, on its own row
   * under the system toolbar, for a screen in a native stack that wants the system's.
   * @default drawn
   */
  readonly header?: 'native' | 'drawn';
  /** Renders the screen's scroll view or list with the bindings. */
  readonly children: (bindings: RootScrollBindings) => ReactNode;
  readonly testID?: string;
}

const PREMIUM_LARGE_TITLE = kitType.largeTitle.size;

/** The drawn title row's height, after which the title has left and the bar shows it. */
const TITLE_ROW = 52;

const KEYBOARD_TAPS = {
  keyboardShouldPersistTaps: 'handled',
  keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
} as const;

const NATIVE_SCROLL: RootScrollProps = {
  ...KEYBOARD_TAPS,
  contentInsetAdjustmentBehavior: 'automatic',
};

/**
 * The root screen type (foundations-spec §1): large title, at most two glass actions with the
 * `+` as the ink one, the tab bar showing and no back. The title collapses into the bar as the
 * content scrolls; the screen's list must be its first child so the iOS 26 tab bar can minimise.
 */
export function RootScreen({ title, actions = [], header, children, testID }: RootScreenProps) {
  // No back by design: the tab bar shows, and a pushed root page (Inbox) leaves by edge swipe or
  // system back.
  useNoBackByDesign();
  const ordered = capActions(actions, 2);
  const mode = header ?? 'drawn';
  if (mode === 'native') {
    return (
      <NativeRootScreen title={title} actions={ordered} testID={testID}>
        {children}
      </NativeRootScreen>
    );
  }
  return (
    <DrawnRootScreen title={title} actions={ordered} testID={testID}>
      {children}
    </DrawnRootScreen>
  );
}

interface RootScreenParts {
  readonly title: string;
  readonly actions: readonly ShellAction[];
  readonly children: RootScreenProps['children'];
  readonly testID?: string | undefined;
}

function NativeRootScreen({ title, actions, children, testID }: RootScreenParts) {
  const t = usePremiumTheme();
  // System buttons only: a toolbar view's content is invisible to VoiceOver on iOS 26. The `+`
  // opens its sheet straight away: the native form sheet's own rise is the motion (a drawn shape
  // growing over it played a second sheet on top of the real one).
  const native = actions.map((action): ShellAction => {
    const button: ShellAction = { ...action };
    delete (button as { element?: unknown }).element;
    return button;
  });
  const ink = t.color.ink;
  // Stable while the title and ink hold: new options on every render make the navigator redraw.
  const options = useMemo(
    () => ({
      headerShown: true,
      title,
      headerLargeTitleEnabled: true,
      headerTransparent: true,
      headerShadowVisible: false,
      headerLargeTitleShadowVisible: false,
      headerTintColor: ink,
      // 32/700 as the design's root title; the system bar keeps its own tracking and inset.
      headerLargeTitleStyle: {
        color: ink,
        fontWeight: '700' as const,
        fontSize: PREMIUM_LARGE_TITLE,
      },
      headerTitleStyle: { color: ink },
    }),
    [title, ink],
  );
  return (
    <View testID={testID} style={styles.root} collapsable={false}>
      <Stack.Screen options={options} />
      <NativeHeaderActions actions={native} />
      {children({ scrollProps: NATIVE_SCROLL, largeTitle: null })}
    </View>
  );
}

function DrawnRootScreen({ title, actions, children, testID }: RootScreenParts) {
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const [collapsed, setCollapsed] = useState(false);
  // Whether content runs on under the tab bar, for the longer fade there.
  const edges = useScrollEdges();
  const track = edges.scrollProps;

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setCollapsed(event.nativeEvent.contentOffset.y > TITLE_ROW);
      track.onScroll(event);
    },
    [track],
  );

  // The drawn title keeps the status bar clear itself: iOS adding its own inset as well (a root in
  // a tab's native stack) set the title a row below its actions. The native tabs leave these
  // insets alone (`disableAutomaticContentInsets` in `PremiumTabs`).
  const scrollProps = useMemo(
    (): RootScrollProps => ({
      ...KEYBOARD_TAPS,
      contentInsetAdjustmentBehavior: 'never',
      automaticallyAdjustContentInsets: false,
      onScroll,
      onLayout: track.onLayout,
      onContentSizeChange: track.onContentSizeChange,
      scrollEventThrottle: 16,
    }),
    [onScroll, track],
  );
  const barTop = insets.top;
  const barHeight = barTop + t.size.glassNav + t.space.gap8;
  const largeTitle = (
    <View style={{ paddingTop: barTop + t.space.gap6, paddingHorizontal: t.space.titleGutter }}>
      <Text
        variant="largeTitle"
        accessibilityRole="header"
        numberOfLines={1}
        style={styles.largeTitle}
      >
        {title}
      </Text>
    </View>
  );

  // A tab's root page fades into its ground under Android's drawn bar.
  const tabRoot = useScreenPlacement();
  const fade = Platform.OS === 'android' && tabRoot?.kind === 'root' && tabRoot.tab;
  return (
    <View testID={testID} style={styles.root} collapsable={false}>
      {children({ scrollProps, largeTitle })}
      {fade ? <TabBarFade continues={edges.bottom} /> : null}
      {/* The content fades out under the collapsed bar instead of meeting its edge in a line. */}
      {collapsed ? (
        <ScrollEdgeFade
          edge="top"
          offset={barHeight}
          height={SCROLL_EDGE_FADE}
          color={t.material.regular.fill}
        />
      ) : null}
      <View pointerEvents="box-none" style={[styles.bar, { height: barHeight }]}>
        {/* Glass never fades (the system stops drawing it below full opacity): it comes and goes
            whole, and only the title fades. */}
        {collapsed ? (
          <GlassSurface kind="regular" style={StyleSheet.absoluteFill} testID="root-bar" />
        ) : null}

        {/* Mounted only while collapsed: a faded-out copy of the title would still sit over the
            large title's row for screen readers and the layout checks. */}
        {collapsed ? (
          <Animated.View
            entering={reducedFadeIn()}
            exiting={reducedFadeOut()}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          >
            <View style={[styles.barTitle, { top: barTop }]}>
              <Text variant="rowTitle" numberOfLines={1}>
                {title}
              </Text>
            </View>
          </Animated.View>
        ) : null}
        <View
          style={[styles.barActions, { top: barTop + t.space.gap6 - 2, right: t.space.gutter }]}
        >
          <DrawnHeaderActions actions={actions} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // A floor, not a height: the title grows with larger text instead of clipping.
  largeTitle: { minHeight: TITLE_ROW - 6 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0 },
  barTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barActions: { position: 'absolute' },
});
