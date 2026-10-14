import { router, Stack } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBackAffordance } from '@/lib/qa/back-affordance';

import { Text, usePremiumTheme } from '../..';
import { BodyTitleContext } from '../../text/body-title';
import { leadingControlFor, useScreenPlacement } from '../navigation/use-screen-placement';
import {
  capActions,
  DrawnHeaderActions,
  DrawnLeadingControl,
  NativeHeaderActions,
  NativeLeadingControl,
} from './header-actions';
import type { ShellAction } from './header-actions';
import { CrumbBar, HeaderBar, HeaderTitle } from './header-bar';
import { useBodyTitle, useHeaderLeavesWithPage } from './push-screen-hooks';
import { SCROLL_EDGE_FADE, ScrollEdgeFade, useScrollEdges } from './scroll-edge';

export interface PushScreenProps {
  /** The centred inline title (19/700). */
  readonly title: string;
  /** The muted line under it (12/400). */
  readonly subtitle?: string;
  /** The one right action (share, ⋯, Edit, a labelled glass pill). */
  readonly action?: ShellAction;
  /**
   * No bar: the page starts with a photo or map, and the glass back (and the action) float over
   * it on clear glass. The zoom target of a card uses this (zoom glitches under a header).
   */
  readonly headerless?: boolean;
  /**
   * The title as a large title under the bar (Settle up, 7.24): the glass back with the page it
   * returns to named beside it, then the title, left-aligned, on both platforms.
   */
  readonly largeTitle?: boolean;
  /** The label the back button speaks. */
  readonly backLabel: string;
  /** The label the ✕ speaks when the page is the first screen of a sheet or modal ("Close"). */
  readonly closeLabel?: string;
  /**
   * The leading control. `auto` (the default) follows where the page sits: pushed → glass back
   * `<`, the first screen of a sheet or modal → ✕, a tab's first screen → none.
   */
  readonly leading?: 'auto' | 'back' | 'close' | 'none';
  /** Content scrolls under the bar. Off when the page brings its own list. @default true */
  readonly scroll?: boolean;
  readonly children: ReactNode;
  readonly testID?: string;
}

const goBack = () => router.back();

/** The iOS navigation bar under the status bar (the title row with its glass controls). */
const NATIVE_BAR_HEIGHT = 44;

const goHome = () => router.replace('/');

/**
 * The push screen type (foundations-spec §1): glass back left, centred title and subtitle, one
 * right action; edge swipe goes back and the tab bar is gone (pushed on the root stack). iOS uses
 * the native bar (the system glass back and toolbar). Android draws the whole bar itself, one glass
 * `<` (or ✕), the title and the action, since the Material bar adds its own arrow beside a drawn
 * back. A headerless page draws the glass circles itself over its hero.
 *
 * The leading control follows where the page sits (`useScreenPlacement`): pushed on its own stack
 * it is the bar's native back; the first page of a pushed group gets the shell's glass back (the
 * native bar has none there); the first page of a sheet or modal gets ✕ (`closeLabel`); a pushed
 * page inside a sheet or modal gets `<` again.
 *
 * The bar's options only change with the title and the back control, so a page re-rendering (a
 * keyboard closing, a query echo) never makes the navigator redraw its headers.
 */
export function PushScreen({
  title,
  subtitle,
  action,
  headerless = false,
  largeTitle = false,
  backLabel,
  closeLabel,
  leading = 'auto',
  scroll = true,
  children,
  testID,
}: PushScreenProps) {
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  useHeaderLeavesWithPage();
  // A large title in the body makes this a crumb page: the bar shows the back and the page it
  // returns to, and no inline title (one title per page).
  const [bodyTitle, reportBodyTitle] = useBodyTitle();
  const crumb = bodyTitle && !largeTitle && !headerless;
  const actions = capActions(action === undefined ? [] : [action], 1);
  const ios = Platform.OS === 'ios';
  const placement = useScreenPlacement();
  const control = leading === 'auto' ? leadingControlFor(placement) : leading;
  // The native bar has its own back only for a page pushed on its own stack; the first screen of
  // a pushed group, or of a sheet or modal, gets the shell's control instead.
  const nativeBack =
    ios &&
    control === 'back' &&
    (placement === undefined || (placement.kind === 'pushed' && placement.ownStack));
  const drawnControl =
    control === 'none' || nativeBack ? null : control === 'home' ? 'back' : control;
  const leadingLabel = control === 'close' ? (closeLabel ?? backLabel) : backLabel;
  const leave = control === 'home' ? goHome : goBack;
  // The bar's native back is the way back, and so is the shell's back or ✕ as a native toolbar
  // item on iOS; a drawn back or ✕ registers itself.
  useBackAffordance(!headerless && !largeTitle && ios && (nativeBack || drawnControl !== null));

  const ink = t.color.ink;
  const nativeOptions = useMemo(
    () => ({
      headerShown: true,
      title,
      headerTitle: crumb ? () => null : () => <HeaderTitle title={title} subtitle={subtitle} />,
      headerTitleAlign: 'center' as const,
      headerTransparent: true,
      headerShadowVisible: false,
      // A crumb page's back names the page it returns to ("‹ Bookings").
      headerBackButtonDisplayMode: crumb ? ('default' as const) : ('minimal' as const),
      ...(crumb ? { headerBackTitle: backLabel } : {}),
      headerBackVisible: nativeBack,
      headerTintColor: ink,
    }),
    [title, subtitle, nativeBack, ink, crumb, backLabel],
  );
  const drawnOptions = useMemo(() => ({ headerShown: false, title }), [title]);

  const edges = useScrollEdges();
  const content = <BodyTitleContext value={reportBodyTitle}>{children}</BodyTitleContext>;
  // Under the transparent native bar (iOS) the page keeps the status bar and the bar's height
  // clear itself: the system's automatic inset is lost when the scroll view isn't the one the
  // screen's controller tracks, and the content then started under the bar's title.
  const underNativeBar = ios && !headerless && !largeTitle;
  const barGround = insets.top + NATIVE_BAR_HEIGHT;
  const body = scroll ? (
    <ScrollView
      contentInsetAdjustmentBehavior={underNativeBar ? 'never' : 'automatic'}
      contentContainerStyle={
        underNativeBar
          ? { paddingTop: barGround, paddingBottom: insets.bottom + t.space.gap16 }
          : { paddingBottom: t.space.gap16 }
      }
      {...(underNativeBar ? { scrollIndicatorInsets: { top: barGround } } : {})}
      keyboardShouldPersistTaps="handled"
      {...edges.scrollProps}
    >
      {content}
    </ScrollView>
  ) : (
    content
  );
  // Under a drawn bar or large title the content fades into the ground as it scrolls up under
  // them.
  const fadedBody = scroll ? (
    <View style={styles.body}>
      {body}
      <ScrollEdgeFade edge="top" height={SCROLL_EDGE_FADE} visible={edges.top} />
    </View>
  ) : (
    body
  );

  if (headerless) {
    return (
      <View testID={testID} style={styles.root}>
        <Stack.Screen options={drawnOptions} />
        {body}
        <View
          pointerEvents="box-none"
          style={[
            styles.floating,
            { top: insets.top + t.space.gap6, paddingHorizontal: t.space.gutter },
          ]}
        >
          {control === 'none' ? (
            <View />
          ) : (
            <DrawnLeadingControl
              kind={control === 'close' ? 'close' : 'back'}
              label={leadingLabel}
              overPhoto
              onPress={leave}
            />
          )}
          {actions.length > 0 ? <DrawnHeaderActions actions={actions} /> : null}
        </View>
      </View>
    );
  }

  // The drawn crumb bar: the glass back with the page it returns to beside it, then (for a
  // `largeTitle` page) the title under it. A crumb page on iOS keeps the native bar.
  if ((largeTitle || (crumb && !ios)) && !headerless) {
    return (
      <View testID={testID} style={[styles.root, { backgroundColor: t.color.ground }]}>
        <Stack.Screen options={drawnOptions} />
        <CrumbBar
          top={insets.top + t.space.gap6}
          leading={
            control === 'none' ? null : (
              <DrawnLeadingControl
                kind={control === 'close' ? 'close' : 'back'}
                label={leadingLabel}
                onPress={leave}
              />
            )
          }
          crumb={control === 'back' || control === 'home' ? backLabel : null}
          trailing={actions.length > 0 ? <DrawnHeaderActions actions={actions} /> : null}
        />
        {largeTitle ? (
          <View
            style={{
              paddingHorizontal: t.space.gutter,
              paddingTop: t.space.gap12,
              paddingBottom: t.space.gap6,
            }}
          >
            <Text variant="largeTitle" accessibilityRole="header" singleLine={false}>
              {title}
            </Text>
            {subtitle === undefined ? null : (
              <Text variant="rowText" tone="muted" singleLine={false}>
                {subtitle}
              </Text>
            )}
          </View>
        ) : null}
        {fadedBody}
      </View>
    );
  }

  if (!ios) {
    return (
      <View testID={testID} style={[styles.root, { backgroundColor: t.color.ground }]}>
        <Stack.Screen options={drawnOptions} />
        <View style={{ marginTop: insets.top + t.space.gap6, marginBottom: t.space.gap6 }}>
          <HeaderBar
            title={title}
            {...(subtitle === undefined ? {} : { subtitle })}
            leading={
              drawnControl === null ? null : (
                <DrawnLeadingControl kind={drawnControl} label={leadingLabel} onPress={leave} />
              )
            }
            trailing={actions.length > 0 ? <DrawnHeaderActions actions={actions} /> : null}
          />
        </View>
        {/* Keeps the body at the crumb bar's position, so turning into a crumb page doesn't remount it. */}
        {null}
        {fadedBody}
      </View>
    );
  }

  // The native bar is transparent and draws no ground of its own over a page's scroll view: the
  // status bar and the bar get the ground (solid), then a short fade, once content scrolls under.
  return (
    <View testID={testID} style={styles.root}>
      <Stack.Screen options={nativeOptions} />
      {drawnControl !== null ? (
        <NativeLeadingControl kind={drawnControl} label={leadingLabel} onPress={leave} />
      ) : null}
      <NativeHeaderActions actions={actions} />
      {scroll ? (
        <View style={styles.body}>
          {body}
          <ScrollEdgeFade
            edge="top"
            height={barGround + SCROLL_EDGE_FADE}
            solid={barGround}
            visible={edges.top}
          />
        </View>
      ) : (
        body
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  floating: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
