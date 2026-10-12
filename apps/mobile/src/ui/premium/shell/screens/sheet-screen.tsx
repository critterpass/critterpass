import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { router } from 'expo-router';
import { NavigationContext } from 'expo-router/build/react-navigation/core/NavigationContext';
import { NavigationRouteContext } from 'expo-router/build/react-navigation/core/NavigationProvider';
import { useContext, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBackAffordance } from '@/ui/qa/back-affordance';

import { PressableScale, Spinner, Text, usePremiumTheme, type PremiumTheme } from '../..';
import { KeyboardStickyFooter } from '../keyboard/keyboard';
import { useDirtySheetGuard, type DiscardPrompt } from './dirty-sheet';

/** Half height for one choice, full height for a form, or as tall as the content. */
export type SheetDetent = 'half' | 'full' | 'fit';

/** Material's sheet corner on Android; iOS keeps the system's own. */
const ANDROID_SHEET_RADIUS = 28;
/** The band at the top of an iOS sheet that the system grabber draws in and answers taps on. */
const GRABBER_CLEARANCE = 12;

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

/**
 * True when the sheet is the first screen of its stack. A native stack never presents its first
 * screen as a sheet: a sheet route opened from another area (New poll from the crew chat) is the
 * root of its area's stack, drawn as a whole-screen card in a see-through group. It then lays its
 * header below the status bar on the opaque sheet material instead of relying on the system sheet.
 */
function useShownAsPage(): boolean {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  if (navigation === undefined || route === undefined) return false;
  return navigation.getState().routes[0]?.key === route.key;
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
  const asPage = useShownAsPage();
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
        if (close !== false && router.canGoBack()) router.back();
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
        <View style={styles.title}>
          {title === undefined ? null : (
            <Text variant="button" accessibilityRole="header" numberOfLines={1} align="center">
              {title}
            </Text>
          )}
        </View>
        {verb === undefined ? (
          <View style={styles.verbSpace} />
        ) : busy ? (
          <Spinner color={t.color.ink} trackColor={t.color.hairline} />
        ) : (
          <PressableScale
            testID={verb.testID ?? 'sheet-verb'}
            accessibilityLabel={verb.label}
            disabled={verb.disabled === true}
            onPress={() => void runVerb()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text variant="button" tone={verb.disabled === true ? 'placeholder' : 'ink'}>
              {verb.label}
            </Text>
          </PressableScale>
        )}
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
    marginTop: Platform.OS === 'ios' ? GRABBER_CLEARANCE : 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 1,
  },
  pageHeader: { marginTop: 0 },
  cancel: { fontWeight: '400' },
  title: { flex: 1 },
  verbSpace: { minWidth: 44 },
  body: { flex: 1, overflow: 'hidden' },
  scroll: { flex: 1 },
});
