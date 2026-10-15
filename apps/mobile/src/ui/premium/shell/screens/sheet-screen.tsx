import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBackAffordance } from '@/lib/qa/back-affordance';

import { ToastHost, usePremiumTheme, type PremiumTheme } from '../..';
import { KeyboardStickyFooter } from '../keyboard/keyboard';
import { SHEET_TOP_CLEARANCE, useShownAsSheet } from '../navigation/screen-insets';
import { useScreenPlacement } from '../navigation/use-screen-placement';
import { useDirtySheetGuard, type DiscardPrompt } from './dirty-sheet';
import { FooterStack } from './footer-stack';
import { SheetHeader } from './sheet-header';
import { ScrollEdgeFade, useScrollEdges } from './scroll-edge';

/** Half height for one choice, full height for a form, or as tall as the content. */
export type SheetDetent = 'half' | 'full' | 'fit';

/** Material's sheet corner on Android; iOS keeps the system's own. */
const ANDROID_SHEET_RADIUS = 28;

/**
 * A layout's options for a sheet route: the native form sheet with its grabber and detent. On
 * iOS 26 the system draws its edge as Liquid Glass and `SheetScreen` fills the body with the opaque
 * sheet material; the page behind steps back at full height and dims at half.
 */
export function sheetRouteOptions(detent: SheetDetent): NativeStackNavigationOptions {
  return {
    presentation: 'formSheet',
    sheetAllowedDetents: detent === 'half' ? [0.5] : detent === 'full' ? [1] : 'fitToContents',
    sheetGrabberVisible: true,
    contentStyle: { backgroundColor: 'transparent' },
    ...(Platform.OS === 'android' ? { sheetCornerRadius: ANDROID_SHEET_RADIUS } : {}),
  };
}

/**
 * A layout's options for a sheet that stops at more than one height (4.39 rises to 0.79 with the
 * page's top still showing, then drags to full). Android's native sheet lays its content out at
 * the tallest stop and shows the smaller one by sliding it down, so a footer pinned to the bottom
 * sat under the screen's edge: there it opens at the first stop only.
 */
export function sheetDetentOptions(detents: readonly number[]): NativeStackNavigationOptions {
  const first = detents[0] ?? 1;
  return {
    ...sheetRouteOptions('full'),
    sheetAllowedDetents: Platform.OS === 'android' ? [first] : [...detents],
  };
}

/**
 * The sheet material a native form sheet's root draws under its content: the opaque fill, with
 * Material's corners on Android. For a sheet route that
 * draws its own page instead of using `SheetScreen` (Ideas over the plan map).
 */
export function sheetMaterialStyle(t: PremiumTheme): ViewStyle {
  // Opaque on both platforms (the design's sheets never show the page through their body): the
  // fill is the sheet material's tint already laid over the ground.
  const fill = t.material.sheet.fill;
  return Platform.OS === 'android'
    ? {
        backgroundColor: fill,
        borderTopLeftRadius: ANDROID_SHEET_RADIUS,
        borderTopRightRadius: ANDROID_SHEET_RADIUS,
      }
    : // An iOS sheet runs on below its content to its rounded foot (a fit sheet adds the home
      // indicator's room), where the system glass showed the tab bar through: the material
      // carries on down there as a hard shadow of itself, which the sheet's shape clips.
      { backgroundColor: fill, boxShadow: footShadow(fill) };
}

/** How far an iOS sheet's material reaches past its content, into the sheet's foot. */
const IOS_FOOT = 60;

/** The material copied down past the content: a hard shadow, grown and moved down alike. */
function footShadow(fill: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- shadow syntax, never copy.
  return `0 ${IOS_FOOT}px 0 ${IOS_FOOT}px ${fill}`;
}

/** The fade where a sheet's form meets its header and footer: longer than a page's, so a card
 * scrolled under reads as fading, not cut, in a sheet's short window. */
const SHEET_EDGE_FADE = 40;

export interface SheetVerb {
  /** The verb in the ink pill on the right ("Save", "Post", "Add"). */
  readonly label: string;
  /**
   * Keeps the edits, then the sheet closes. Resolve `false` to keep it open (the save failed and
   * says so) or when this navigates somewhere itself.
   */
  readonly onPress: () => void | boolean | Promise<void | boolean>;
  readonly disabled?: boolean;
  readonly testID?: string;
}

export interface SheetScreenProps {
  /** The centred title, when the sheet has one. */
  readonly title?: string;
  /** The muted line under the title (the crew and dates a sheet is about). */
  readonly subtitle?: string;
  /** What the glass ✕ (or back, pushed inside a sheet) says ("Cancel", "Close"). */
  readonly cancelLabel: string;
  readonly verb?: SheetVerb;
  /** Edits not yet kept: swiping down, Cancel and back ask first. */
  readonly dirty?: boolean;
  /** The question a dirty sheet asks before it goes. */
  readonly discardPrompt?: DiscardPrompt;
  /** Content scrolls (a form) or brings its own layout. @default true */
  readonly scroll?: boolean;
  /** Sticks to the bottom and rides the keyboard (a sheet's main button). */
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  readonly testID?: string;
}

/**
 * The sheet screen type (journeys 03, 04, 07, 09): the glass ✕ left, the centred title, the verb as
 * the ink pill right, drawn inside the
 * content on both platforms (Android's native sheet has no header). Swiping down cancels, and with
 * edits it asks first. The keyboard: iOS lifts the sheet itself; the footer rides it on both.
 *
 * Layout: the header row sits below the grabber and the body scrolls under it, never over it.
 * react-native-screens sizes a form sheet's scroll view to the whole sheet when it finds one at the
 * top of the content (its fix for sheets whose content has no fixed bottom), which put the form
 * over the header and swallowed taps on Cancel. The header is therefore a real view first in the
 * row order, and the scroll view lives inside a clipping body view, out of that search.
 */
export function SheetScreen({
  title,
  subtitle,
  cancelLabel,
  verb,
  dirty = false,
  discardPrompt,
  scroll = true,
  footer,
  children,
  testID,
}: SheetScreenProps) {
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  // A page instead of a native sheet: its header then sits below the status bar on the opaque
  // sheet material.
  const asPage = !useShownAsSheet();
  // Pushed inside a sheet (one card at a time) it leads with the glass back, else the glass ✕.
  const pushed = useScreenPlacement()?.kind === 'pushed';
  const [busy, setBusy] = useState(false);
  const edges = useScrollEdges();
  // The glass ✕ is the sheet's way back.
  useBackAffordance();
  const guard = useDirtySheetGuard(
    dirty && discardPrompt !== undefined,
    discardPrompt ?? NO_PROMPT,
  );

  const runVerb = async () => {
    if (verb === undefined || busy) return;
    setBusy(true);
    try {
      await guard.commit(async () => {
        const close = await verb.onPress();
        if (close !== false) {
          guard.leave(() => {
            if (router.canGoBack()) router.back();
          });
        }
      });
    } finally {
      setBusy(false);
    }
  };

  const android = Platform.OS === 'android';
  // Android's native sheet runs under the gesture bar: its last row and its footer keep clear of
  // the home indicator, as a page does. An iOS sheet keeps its own foot.
  const foot = asPage || android ? insets.bottom : 0;
  return (
    <View
      testID={testID}
      style={[
        styles.root,
        asPage
          ? { backgroundColor: t.material.sheet.fill, paddingTop: insets.top }
          : sheetMaterialStyle(t),
      ]}
    >
      {/* A native sheet draws above the page's toasts: its own host shows what goes wrong in it. */}
      <ToastHost bottomOffset={0}>
        {android && !asPage ? (
          <View style={[styles.grabber, { backgroundColor: t.color.placeholder }]} />
        ) : null}
        <SheetHeader
          leading={pushed ? 'back' : 'close'}
          leadingLabel={cancelLabel}
          onLeading={() => router.back()}
          title={title}
          subtitle={subtitle}
          verb={
            verb === undefined
              ? undefined
              : {
                  label: verb.label,
                  disabled: verb.disabled === true,
                  busy,
                  onPress: () => void runVerb(),
                  testID: verb.testID ?? 'sheet-verb',
                }
          }
          style={asPage ? null : styles.header}
        />
        <View collapsable={false} style={styles.body}>
          {scroll ? (
            <ScrollView
              style={styles.scroll}
              // The top gap keeps the first field's focus ring and the first card's shadow whole.
              contentContainerStyle={{
                paddingHorizontal: t.space.gutter,
                paddingTop: t.space.gap8,
                paddingBottom: t.space.gap16 + (footer === undefined ? foot : 0),
              }}
              contentInsetAdjustmentBehavior="never"
              automaticallyAdjustKeyboardInsets
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              {...edges.scrollProps}
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
          {/* The form fades under the header row and into the footer instead of being cut. */}
          {scroll ? (
            <ScrollEdgeFade
              edge="top"
              height={SHEET_EDGE_FADE}
              color={t.material.sheet.fill}
              visible={edges.top}
            />
          ) : null}
          {scroll && footer !== undefined ? (
            <ScrollEdgeFade
              edge="bottom"
              height={SHEET_EDGE_FADE}
              color={t.material.sheet.fill}
              visible={edges.bottom}
            />
          ) : null}
        </View>
        {footer === undefined ? null : (
          <KeyboardStickyFooter
            openedOffset={t.space.gap8}
            ground={t.material.sheet.fill}
            style={{
              paddingHorizontal: t.space.gutter,
              paddingBottom: t.space.gap16 + foot,
            }}
          >
            <FooterStack>{footer}</FooterStack>
          </KeyboardStickyFooter>
        )}
      </ToastHost>
    </View>
  );
}

const NO_PROMPT: DiscardPrompt = { title: '', message: '', discard: '', keep: '' };

// Grow and shrink from the content's own height (not `flex: 1`): a sheet that fits its content
// has no height to fill, and a root that only filled it measured as tall as its header, so its
// material ended there and the page showed through the rest of the sheet. A sheet with a fixed
// height still fills it, and a long form still shrinks to it and scrolls.
const FILL = { flexGrow: 1, flexShrink: 1 } as const;

const styles = StyleSheet.create({
  root: FILL,
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8 },
  // Clears the system grabber (iOS draws it over the top 20 pt of the sheet and takes taps there).
  header: { marginTop: Platform.OS === 'ios' ? SHEET_TOP_CLEARANCE : 0 },
  body: { ...FILL, overflow: 'hidden' },
  scroll: FILL,
});
