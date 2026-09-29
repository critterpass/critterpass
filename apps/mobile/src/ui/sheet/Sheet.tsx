import { router } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SurfaceToneProvider } from '../surface/Scaffold';
import { makeStyles } from '../theme';
import { CloseButton } from './CloseButton';
import { Grabber, GRABBER_ZONE_HEIGHT } from './Grabber';
import { PresentedSurfaceContext } from './presenter';
import { SheetScrollContext } from './SheetScrollView';
import { useModalPresentation } from './use-modal-presentation';

export type SheetDetent = 'large' | 'medium' | 'fit';

/** docs/design-system.md §2.1: large .87 of the screen, medium half, fit = content. */
export const DETENT_FRACTION = { large: 0.87, medium: 0.5 } as const;

/** Ascending visible heights for the requested detents (fit clamped to large, duplicates dropped). */
export function detentHeights(
  detents: readonly SheetDetent[],
  screenHeight: number,
  fitHeight: number | null,
): number[] {
  const large = screenHeight * DETENT_FRACTION.large;
  const heights = detents.map((detent) =>
    detent === 'fit' ? Math.min(large, fitHeight ?? large) : screenHeight * DETENT_FRACTION[detent],
  );
  return [...new Set(heights)].sort((a, b) => a - b);
}

const useStyles = makeStyles((t) => ({
  scrim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: t.color.scrim.hex,
  },
  panel: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    backgroundColor: t.semantic.bg.raised,
    borderTopStartRadius: t.radius.sheetTop,
    borderTopEndRadius: t.radius.sheetTop,
    overflow: 'hidden',
  },
  close: { position: 'absolute', top: t.space['12'], end: t.space['12'] },
  content: { paddingTop: t.space['16'] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    paddingStart: t.size.gutter,
    paddingEnd: t.space['12'],
  },
  headerContent: { flex: 1, minWidth: 0 },
  contentUnderHeader: { paddingTop: t.space['8'] },
}));

export interface SheetProps {
  readonly children: ReactNode;
  /**
   * The sheet's title row (a title, a trailing action such as JOIN WITH A CODE, a search field). It
   * shares one row with the ✕, which sits in flow at its end, centres aligned, so they can never
   * overlap; the header gets the width that is left. Without it the ✕ floats at the top corner.
   */
  readonly header?: ReactNode | undefined;
  readonly detents?: readonly SheetDetent[] | undefined;
  readonly initialDetent?: SheetDetent | undefined;
  /** Called after the dismiss animation; defaults to going back (sheets are `(modal)` routes). */
  readonly onDismiss?: () => void | undefined;
  /** Screen-reader name of the sheet, e.g. its title. */
  readonly accessibilityLabel?: string | undefined;
  readonly testID?: string | undefined;
}

/**
 * Modal sheet: rises to its detent (540, standard) with the presenter scaling to .93 under a .45
 * scrim; drag from the top 110 pt (or from scrolled-to-top content) snaps between detents or
 * dismisses past 150 pt / .55 pt/ms; ✕, scrim tap, Android back and the escape gesture dismiss.
 */
export function Sheet({
  children,
  header,
  detents = ['large'],
  initialDetent,
  onDismiss,
  accessibilityLabel,
  testID = 'sheet',
}: SheetProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const heights = detentHeights(detents, screenHeight, fitHeight);
  const initialHeight = detentHeights(
    [initialDetent ?? detents[0] ?? 'large'],
    screenHeight,
    fitHeight,
  )[0];
  const initialIndex = Math.max(
    0,
    heights.findIndex((height) => height === initialHeight),
  );
  const fitOnly = detents.length > 0 && detents.every((detent) => detent === 'fit');

  const presentation = useModalPresentation({
    variant: 'sheet',
    heights,
    initialIndex,
    onDismissed: onDismiss ?? (() => router.back()),
    testID,
  });
  const { dismiss, maxHeight, keyboardInset } = presentation;

  return (
    <PresentedSurfaceContext.Provider value>
      <SurfaceToneProvider value="dark">
        <View style={StyleSheet.absoluteFill} testID={testID}>
          <Animated.View style={[styles.scrim, presentation.scrimStyle]}>
            <Pressable
              testID={`${testID}-scrim`}
              style={StyleSheet.absoluteFill}
              onPress={dismiss}
              accessible={false}
              importantForAccessibility="no"
            />
          </Animated.View>
          <GestureDetector gesture={presentation.pan}>
            <Animated.View
              testID={`${testID}-panel`}
              accessibilityViewIsModal
              accessibilityLabel={accessibilityLabel}
              onAccessibilityEscape={dismiss}
              style={[styles.panel, { height: maxHeight }, presentation.panelStyle]}
            >
              <Grabber />
              {header !== undefined ? (
                <View
                  style={styles.header}
                  testID={`${testID}-header`}
                  onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
                >
                  <View style={styles.headerContent}>{header}</View>
                  <CloseButton onPress={dismiss} testID={`${testID}-close`} />
                </View>
              ) : null}
              <SheetScrollContext.Provider
                value={{ scroll: presentation.scroll, scrollY: presentation.scrollY }}
              >
                <View
                  style={[
                    styles.content,
                    header !== undefined ? styles.contentUnderHeader : null,
                    fitOnly ? null : { flex: 1 },
                    { paddingBottom: Math.max(insets.bottom, keyboardInset) },
                  ]}
                  onLayout={(event) => {
                    if (!fitOnly) return;
                    const measured =
                      event.nativeEvent.layout.height + GRABBER_ZONE_HEIGHT + headerHeight;
                    if (measured !== fitHeight) setFitHeight(measured);
                  }}
                >
                  {children}
                </View>
              </SheetScrollContext.Provider>
              {header === undefined ? (
                <CloseButton onPress={dismiss} style={styles.close} testID={`${testID}-close`} />
              ) : null}
            </Animated.View>
          </GestureDetector>
        </View>
      </SurfaceToneProvider>
    </PresentedSurfaceContext.Provider>
  );
}
