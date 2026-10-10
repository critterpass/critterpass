import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { PressableScale, Spinner, Text, usePremiumTheme } from '../..';
import { KeyboardStickyFooter } from '../keyboard/keyboard';
import { useDirtySheetGuard, type DiscardPrompt } from './dirty-sheet';

/** Half height for one choice, full height for a form, or as tall as the content. */
export type SheetDetent = 'half' | 'full' | 'fit';

/** Material's sheet corner on Android; iOS keeps the system's own. */
const ANDROID_SHEET_RADIUS = 28;

/**
 * A layout's options for a sheet route: the native form sheet with its grabber and detent. On
 * iOS 26 the system draws it as Liquid Glass (the content stays clear); the page behind steps back
 * at full height and dims at half.
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
  const [busy, setBusy] = useState(false);
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
        android && {
          backgroundColor: t.material.sheet.fill,
          borderTopLeftRadius: ANDROID_SHEET_RADIUS,
          borderTopRightRadius: ANDROID_SHEET_RADIUS,
        },
      ]}
    >
      {android ? <View style={[styles.grabber, { backgroundColor: t.color.placeholder }]} /> : null}
      <View style={[styles.header, { paddingHorizontal: t.space.gutter }]}>
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
      {scroll ? (
        <ScrollView
          style={styles.body}
          contentContainerStyle={{
            paddingHorizontal: t.space.gutter,
            paddingBottom: t.space.gap16,
          }}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.body}>{children}</View>
      )}
      {footer === undefined ? null : (
        <KeyboardStickyFooter
          openedOffset={t.space.gap8}
          style={{ paddingHorizontal: t.space.gutter, paddingBottom: t.space.gap16 }}
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
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancel: { fontWeight: '400' },
  title: { flex: 1 },
  verbSpace: { minWidth: 44 },
  body: { flex: 1 },
});
