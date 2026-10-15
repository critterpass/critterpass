import { router, Stack } from 'expo-router';
import type { ReactNode } from 'react';
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
import { CrumbBar, HeaderBar } from './header-bar';
import { PageFooter } from './page-footer';
import { useBodyTitle, useHeaderLeavesWithPage } from './push-screen-hooks';
import { usePushScreenOptions } from './push-screen-options';
import {
  BAR_OVER_EDGE,
  PageScrollEdgesContext,
  SCROLL_EDGE_FADE,
  ScrollEdgeFade,
  useScrollEdges,
} from './scroll-edge';

export interface PushScreenProps {
  /** The centred inline title (19/700) and the muted line under it (12/400). */
  readonly title: string;
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
  /** What the ✕ says on a sheet's or modal's first screen ("Close"). */
  readonly closeLabel?: string;
  /** `auto`: pushed → glass `<`, a sheet's or modal's first screen → ✕, a tab's first → none. */
  readonly leading?: 'auto' | 'back' | 'close' | 'none';
  /** A pill on a crumb page's back row ("Only you see this"), in the crumb's place. */
  readonly badge?: ReactNode;
  /** @default 'end' */
  readonly badgeAlign?: 'end' | 'centre';
  /** Content scrolls under the bar. Off when the page brings its own list. @default true */
  readonly scroll?: boolean;
  /** The foot of actions (`PageFooter`) under the scroll view; the content fades out above it. */
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  readonly testID?: string;
}

const goBack = () => router.back();
const goHome = () => router.replace('/');
/** The iOS navigation bar under the status bar (the title row with its glass controls). */
const NATIVE_BAR_HEIGHT = 44;

/**
 * The push screen type (foundations-spec §1): glass back left, centred title and subtitle, one
 * right action; edge swipe goes back and the tab bar is gone (pushed on the root stack). iOS uses
 * the native bar (the system glass back and toolbar). Android draws the whole bar itself, one glass
 * `<` (or ✕), the title and the action, since the Material bar adds its own arrow beside a drawn
 * back. A crumb or large-title page draws its crumb bar on both platforms. A headerless page draws
 * the glass circles itself over its hero. A `footer` stands on the ground under the content.
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
  badge,
  badgeAlign = 'end',
  scroll = true,
  footer,
  children,
  testID,
}: PushScreenProps) {
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  useHeaderLeavesWithPage();
  // A large title in the body makes this a crumb page: back and crumb, no inline title.
  const [bodyTitle, reportBodyTitle] = useBodyTitle();
  const crumb = bodyTitle && !largeTitle && !headerless;
  const actions = capActions(action === undefined ? [] : [action], 1);
  const ios = Platform.OS === 'ios';
  const placement = useScreenPlacement();
  const control = leading === 'auto' ? leadingControlFor(placement) : leading;
  // A crumb page draws its glass back with the crumb beside it on both platforms.
  const drawnBar = !ios || largeTitle || crumb;
  // The native bar has its own back only for a page pushed on its own stack; the first screen of
  // a pushed group, or of a sheet or modal, gets the shell's control instead.
  const nativeBack =
    !drawnBar &&
    !headerless &&
    control === 'back' &&
    (placement === undefined || (placement.kind === 'pushed' && placement.ownStack));
  const drawnControl =
    control === 'none' || nativeBack ? null : control === 'home' ? 'back' : control;
  const leadingLabel = control === 'close' ? (closeLabel ?? backLabel) : backLabel;
  const leave = control === 'home' ? goHome : goBack;
  // The native back or toolbar ✕ is the way back; a drawn back or ✕ registers itself.
  useBackAffordance(!headerless && !drawnBar && (nativeBack || drawnControl !== null));

  // Under the transparent native bar (iOS) the page keeps the status bar and the bar clear itself
  // (the system's own inset is lost on a scroll view its controller doesn't track).
  const underNativeBar = !drawnBar && !headerless;
  const barGround = insets.top + NATIVE_BAR_HEIGHT;
  // A page with its own scroll view under the native bar reports its edges; that view keeps the
  // system's inset, so it rests at minus the bar's height.
  const ownScroll = !scroll && underNativeBar;
  const edges = useScrollEdges(ownScroll ? { topAfter: -barGround } : {});
  const options = usePushScreenOptions(underNativeBar, {
    title,
    ...(subtitle === undefined ? {} : { subtitle }),
    back: nativeBack,
    ink: t.color.ink,
  });
  const content = (
    <BodyTitleContext value={reportBodyTitle}>
      <PageScrollEdgesContext value={ownScroll ? edges.scrollProps : null}>
        {children}
      </PageScrollEdgesContext>
    </BodyTitleContext>
  );
  const footed = footer !== undefined;
  // With a footer the scroll view ends above it: the footer keeps the home indicator's room.
  const foot = footed ? t.space.gap16 : insets.bottom + t.space.gap16;
  const body = scroll ? (
    <ScrollView
      contentInsetAdjustmentBehavior={underNativeBar ? 'never' : 'automatic'}
      contentContainerStyle={
        // A first card keeps a gap under the bar, and its shadow stays whole.
        underNativeBar
          ? { paddingTop: barGround + t.space.gap8, paddingBottom: foot }
          : { paddingTop: headerless ? 0 : t.space.gap8, paddingBottom: t.space.gap16 }
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
  // Over a footer the content fades into the ground instead of being cut at its edge.
  const footFade =
    scroll && footed ? (
      <ScrollEdgeFade edge="bottom" height={SCROLL_EDGE_FADE} visible={edges.bottom} />
    ) : null;
  // Under a drawn bar the content fades into the ground as it scrolls up under it; under the
  // transparent native bar (iOS) the status bar and the bar get the ground (solid), then a short
  // fade. A headerless page's hero runs to the top.
  const topFade = headerless ? null : (
    <ScrollEdgeFade
      edge="top"
      height={(underNativeBar ? barGround : 0) + SCROLL_EDGE_FADE}
      solid={underNativeBar ? barGround : 0}
      visible={edges.top}
    />
  );
  const leadingNode =
    drawnControl === null ? null : (
      <DrawnLeadingControl
        kind={drawnControl}
        label={leadingLabel}
        overPhoto={headerless}
        onPress={leave}
      />
    );
  const trailing = actions.length > 0 ? <DrawnHeaderActions actions={actions} /> : null;

  // One shape for every kind of bar, so a page that turns into a crumb page (its body reports a
  // large title) keeps its body mounted: only the bar in front of it changes.
  let bar: ReactNode;
  if (headerless) bar = null;
  else if (largeTitle || crumb) {
    bar = (
      <>
        <CrumbBar
          top={insets.top + t.space.gap6}
          leading={leadingNode}
          crumb={control === 'back' || control === 'home' ? backLabel : null}
          trailing={trailing}
          badge={badge === undefined ? undefined : { node: badge, align: badgeAlign }}
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
      </>
    );
  } else if (drawnBar) {
    bar = (
      <View
        style={{
          marginTop: insets.top + t.space.gap6,
          marginBottom: t.space.gap6,
          zIndex: BAR_OVER_EDGE,
        }}
      >
        <HeaderBar
          title={title}
          {...(subtitle === undefined ? {} : { subtitle })}
          leading={leadingNode}
          trailing={trailing}
        />
      </View>
    );
  } else {
    bar = (
      <>
        {drawnControl !== null ? (
          <NativeLeadingControl kind={drawnControl} label={leadingLabel} onPress={leave} />
        ) : null}
        <NativeHeaderActions actions={actions} />
      </>
    );
  }

  const grounded = drawnBar && !headerless;
  return (
    <View
      testID={testID}
      style={[styles.root, grounded ? { backgroundColor: t.color.ground } : null]}
    >
      <Stack.Screen options={options} />
      {headerless ? null : bar}
      {scroll ? (
        <View style={styles.body}>
          {body}
          {topFade}
          {footFade}
        </View>
      ) : (
        body
      )}
      {ownScroll ? topFade : null}
      {footed ? <PageFooter>{footer}</PageFooter> : null}
      {headerless ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.floating,
            { top: insets.top + t.space.gap6, paddingHorizontal: t.space.gutter },
          ]}
        >
          {control === 'none' ? <View /> : leadingNode}
          {trailing}
        </View>
      ) : null}
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
