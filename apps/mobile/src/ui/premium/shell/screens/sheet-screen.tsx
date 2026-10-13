import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBackAffordance } from '@/lib/qa/back-affordance';

import {
  PressableScale,
  Spinner,
  Text,
  ToastHost,
  usePremiumTheme,
  type PremiumTheme,
} from '../..';
import { KeyboardStickyFooter } from '../keyboard/keyboard';
import { SHEET_TOP_CLEARANCE, useShownAsSheet } from '../navigation/screen-insets';
import { useDirtySheetGuard, type DiscardPrompt } from './dirty-sheet';

/** Half height for one choice, full height for a form, or as tall as the content. */
export type SheetDetent = 'half' | 'full' | 'fit';

/** Material's sheet corner on Android; iOS keeps the system's own. */
const ANDROID_SHEET_RADIUS = 28;

/**
 * A layout's options for a sheet route: the native form sheet with its grabber and detent. On
 * iOS 26 the system draws it as Liquid Glass and `SheetScreen` lays the sheet material's tint over
 * it; the page behind steps back at full height and dims at half.
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
 * The sheet material a native form sheet's root draws under its content: the opaque fill with
 * Material's corners on Android, and on iOS the tint over the system glass. For a sheet route that
 * draws its own page instead of using `SheetScreen` (Ideas over the plan map).
 */
export function sheetMaterialStyle(t: PremiumTheme): ViewStyle {
  return Platform.OS === 'android'
    ? {
        backgroundColor: t.material.sheet.fill,
        borderTopLeftRadius: ANDROID_SHEET_RADIUS,
        borderTopRightRadius: ANDROID_SHEET_RADIUS,
      }
    : // Sheet glass (foundations-spec §5): the system glass blurs, this tint makes it the sheet's
      // denser material so the page behind reads as colour, not content.
      { backgroundColor: t.material.sheet.tint };
}

export interface SheetVerb {
  /** The bold word on the right ("Save", "Post", "Add"). */
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
  /** The left word ("Cancel"). */
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
 * The sheet screen type (foundations-spec §1): Cancel left, bold verb right, drawn inside the
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
  const [busy, setBusy] = useState(false);
  // Cancel is the sheet's way back.
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
        <View
          collapsable={false}
          style={[
            styles.header,
            { paddingHorizontal: t.space.gutter },
            asPage ? styles.pageHeader : null,
          ]}
        >
          {/* Equal sides keep the title centred whatever the words' widths ("Hủy" / "Lưu"). */}
          <View style={styles.side}>
            <PressableScale
              testID="sheet-cancel"
              accessibilityLabel={cancelLabel}
              onPress={() => router.back()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text variant="button" style={styles.cancel}>
                {cancelLabel}
              </Text>
            </PressableScale>
          </View>
          <View style={styles.title}>
            {title === undefined ? null : (
              <Text variant="button" accessibilityRole="header" numberOfLines={1} align="center">
                {title}
              </Text>
            )}
            {subtitle === undefined ? null : (
              <Text variant="caption" tone="muted" numberOfLines={1} align="center">
                {subtitle}
              </Text>
            )}
          </View>
          <View style={[styles.side, styles.sideEnd]}>
            {verb === undefined ? null : (
              <PressableScale
                testID={verb.testID ?? 'sheet-verb'}
                accessibilityLabel={verb.label}
                accessibilityState={{ busy }}
                disabled={verb.disabled === true || busy}
                onPress={() => void runVerb()}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                {/* The word keeps its width while the spinner stands in for it. */}
                <Text
                  variant="button"
                  tone={verb.disabled === true ? 'placeholder' : 'ink'}
                  style={busy ? styles.hidden : null}
                >
                  {verb.label}
                </Text>
                {busy ? (
                  <View style={styles.spinner}>
                    <Spinner color={t.color.ink} trackColor={t.color.hairline} />
                  </View>
                ) : null}
              </PressableScale>
            )}
          </View>
        </View>
        <View collapsable={false} style={styles.body}>
          {scroll ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={{
                paddingHorizontal: t.space.gutter,
                paddingBottom: t.space.gap16,
              }}
              contentInsetAdjustmentBehavior="never"
              automaticallyAdjustKeyboardInsets
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </View>
        {footer === undefined ? null : (
          <KeyboardStickyFooter
            openedOffset={t.space.gap8}
            style={{
              paddingHorizontal: t.space.gutter,
              paddingBottom: t.space.gap16 + (asPage ? insets.bottom : 0),
            }}
          >
            {footer}
          </KeyboardStickyFooter>
        )}
      </ToastHost>
    </View>
  );
}

const NO_PROMPT: DiscardPrompt = { title: '', message: '', discard: '', keep: '' };

const styles = StyleSheet.create({
  root: { flex: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8 },
  // Clears the system grabber (iOS draws it over the top 20 pt of the sheet and takes taps there).
  header: {
    height: 56,
    marginTop: Platform.OS === 'ios' ? SHEET_TOP_CLEARANCE : 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 1,
  },
  pageHeader: { marginTop: 0 },
  cancel: { fontWeight: '400' },
  side: { flex: 1, flexDirection: 'row' },
  sideEnd: { justifyContent: 'flex-end' },
  title: { flexShrink: 1, maxWidth: '60%' },
  hidden: { opacity: 0 },
  spinner: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, overflow: 'hidden' },
  scroll: { flex: 1 },
});
