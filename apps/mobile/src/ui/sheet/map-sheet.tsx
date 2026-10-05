/**
 * The sheet every map screen keeps over its live map (7a-1 peek, 7a-2 half, 7a-3 full; 7c-1).
 * Non-modal: no scrim, the map above it stays live, and only drags that start on the sheet move
 * it. Content scrolls only at full (`MapSheetScrollView`); below full, a drag anywhere on the
 * sheet moves it. Screen readers get Expand and Collapse actions on the grabber.
 */
import { useLingui } from '@lingui/react/macro';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SurfaceToneProvider } from '../surface/Scaffold';
import { makeStyles } from '../theme';
import { Grabber, GRABBER_ZONE_HEIGHT } from './Grabber';
import { mapSheetHeights, type MapSheetSnap } from './map-sheet-snap';
import { SheetScrollContext, SheetScrollView } from './SheetScrollView';
import { useMapSheet } from './use-map-sheet';

export type { MapSheetSnap } from './map-sheet-snap';

/** How much map the full sheet leaves above it under the status bar (7a-3). */
const FULL_MAP_PEEK = 64;

const useStyles = makeStyles((t) => ({
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
  content: { flex: 1 },
}));

interface MapSheetContextValue {
  readonly atFull: boolean;
  readonly reportContent: (offset: number, height: number) => void;
}

const MapSheetContext = createContext<MapSheetContextValue | null>(null);

export interface MapSheetProps {
  readonly children: ReactNode;
  /** The snap to move to; changing it moves the sheet (a day chip opens half). */
  readonly snap?: MapSheetSnap | undefined;
  readonly initialSnap?: MapSheetSnap | undefined;
  /** Called when the sheet settles at another snap, by a drag, Android back or `snap`. */
  readonly onSnapChange?: ((snap: MapSheetSnap) => void) | undefined;
  /** Map left showing above the full sheet; defaults to the status bar plus a strip of map. */
  readonly topInset?: number | undefined;
  /** Space the content keeps clear at its foot (a tab bar laid over the sheet). */
  readonly footClearance?: number | undefined;
  /** Screen-reader name of the sheet, e.g. "Wed Oct 14". */
  readonly accessibilityLabel: string;
  readonly testID?: string | undefined;
  /**
   * What Android back does to a raised sheet: `step` (default) lowers it one snap per press;
   * `rest` brings it straight down to peek, so leaving the screen takes two presses at most.
   */
  readonly backCollapses?: 'step' | 'rest' | undefined;
}

export function MapSheet({
  children,
  snap,
  initialSnap = 'peek',
  onSnapChange,
  topInset,
  footClearance,
  accessibilityLabel,
  testID = 'map-sheet',
  backCollapses,
}: MapSheetProps) {
  const styles = useStyles();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const [containerHeight, setContainerHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);
  const mapAbove = topInset ?? insets.top + FULL_MAP_PEEK;
  const heights = useMemo(
    () => mapSheetHeights(containerHeight, mapAbove, contentHeight),
    [containerHeight, mapAbove, contentHeight],
  );
  const sheet = useMapSheet({ heights, initialSnap, onSnapChange, testID, backCollapses });
  const { snapTo } = sheet;
  const snapToRef = useRef(snapTo);
  useEffect(() => {
    snapToRef.current = snapTo;
  }, [snapTo]);

  // Only a change of `snap` moves the sheet; a drag elsewhere is not undone by a re-render.
  useEffect(() => {
    if (snap !== undefined) snapToRef.current(snap);
  }, [snap]);

  const foot = footClearance ?? insets.bottom;
  const context: MapSheetContextValue = {
    atFull: sheet.snap === 'full',
    reportContent: (offset, height) => {
      const total = Math.ceil(GRABBER_ZONE_HEIGHT + offset + height + foot);
      setContentHeight((current) => (current === total ? current : total));
    },
  };
  const expandLabel = t({ id: 'kit.mapSheet.expand', message: 'Expand' });
  const collapseLabel = t({ id: 'kit.mapSheet.collapse', message: 'Collapse' });
  const actions = [
    ...(sheet.snap === 'full' ? [] : [{ name: 'expand', label: expandLabel }]),
    ...(sheet.snap === 'peek' ? [] : [{ name: 'collapse', label: collapseLabel }]),
  ];

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(event) => setContainerHeight(event.nativeEvent.layout.height)}
    >
      {containerHeight > 0 ? (
        <SurfaceToneProvider value="dark">
          <GestureDetector gesture={sheet.pan}>
            <Animated.View
              testID={testID}
              style={[styles.panel, { height: sheet.fullHeight }, sheet.panelStyle]}
            >
              <View
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={accessibilityLabel}
                accessibilityState={{ expanded: sheet.snap === 'full' }}
                accessibilityActions={actions}
                onAccessibilityAction={(event) => {
                  const name = event.nativeEvent.actionName;
                  if (name === 'expand' || name === 'increment') {
                    snapTo(sheet.snap === 'peek' ? 'half' : 'full');
                  } else if (name === 'collapse' || name === 'decrement') {
                    snapTo(sheet.snap === 'full' ? 'half' : 'peek');
                  }
                }}
                testID={`${testID}-grabber`}
              >
                <Grabber />
              </View>
              <SheetScrollContext.Provider value={{ scroll: sheet.scroll, scrollY: sheet.scrollY }}>
                <MapSheetContext.Provider value={context}>
                  <View style={[styles.content, { paddingBottom: foot }]}>{children}</View>
                </MapSheetContext.Provider>
              </SheetScrollContext.Provider>
            </Animated.View>
          </GestureDetector>
        </SurfaceToneProvider>
      ) : null}
    </View>
  );
}

/**
 * Scrollable content of a `MapSheet`: scrolls only at full, hands a downward drag back to the
 * sheet once at its top, and tells the sheet how tall it is so a short list caps the snaps.
 */
export function MapSheetScrollView({ onLayout, onContentSizeChange, ...props }: ScrollViewProps) {
  const context = useContext(MapSheetContext);
  const measured = useRef({ offset: 0, height: 0 });
  if (context === null) return <ScrollView {...props} />;
  return (
    <SheetScrollView
      {...props}
      scrollEnabled={context.atFull}
      onLayout={(event) => {
        measured.current.offset = event.nativeEvent.layout.y;
        context.reportContent(measured.current.offset, measured.current.height);
        onLayout?.(event);
      }}
      onContentSizeChange={(width, height) => {
        measured.current.height = height;
        context.reportContent(measured.current.offset, height);
        onContentSizeChange?.(width, height);
      }}
    />
  );
}
