import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';
import { LegendList } from '@legendapp/list/react-native';
import type { LegendListRef } from '@legendapp/list/react-native';
import { Canvas, Group, Image, Path } from '@shopify/react-native-skia';
import { drawAsImage } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { buildGeckoDrawing } from './critter-gecko-ops';
import { buildGeckoPaintOps } from './critter-skia-paint';
import { Scaffold, Text } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const GRID_ROWS = 150;
const GRID_COLUMNS = 4;
const CELL_SIZE = 84;
const IDLE_CRITTER_COUNT = 6;

type ListImplementation = 'flash-list' | 'legend-list';

interface GridCell {
  readonly id: string;
}

const gridData: GridCell[] = Array.from({ length: GRID_ROWS * GRID_COLUMNS }, (_, i) => ({
  id: `cell-${i}`,
}));

/** One idle-bobbing critter drawn from the same cached image — transform-only, no redraw per frame. */
function IdleBobbingCritter({ image, index }: { image: SkImage; index: number }) {
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: withRepeat(
          withSequence(withTiming(-6, { duration: 1200 }), withTiming(0, { duration: 1200 })),
          -1,
          true,
        ),
      },
    ],
  }));
  return (
    <Animated.View key={index} style={[styles.idleCritter, style]}>
      <Canvas style={{ width: CELL_SIZE * 0.6, height: CELL_SIZE * 0.6 }}>
        <Image
          image={image}
          x={0}
          y={0}
          width={CELL_SIZE * 0.6}
          height={CELL_SIZE * 0.6}
          fit="contain"
        />
      </Canvas>
    </Animated.View>
  );
}

/** Renders one grid cell's cached critter image — no per-frame ribbon tessellation, matching the
 * phase's stated fallback (pre-baked thumbnails in the grid, live Skia only for a focused critter). */
function GridCritterCell({ image }: { image: SkImage | null }) {
  if (!image) return <View style={[styles.cell, { width: CELL_SIZE, height: CELL_SIZE }]} />;
  return (
    <View style={[styles.cell, { width: CELL_SIZE, height: CELL_SIZE }]}>
      <Canvas style={{ width: CELL_SIZE, height: CELL_SIZE }}>
        <Image
          image={image}
          x={4}
          y={4}
          width={CELL_SIZE - 8}
          height={CELL_SIZE - 8}
          fit="contain"
        />
      </Canvas>
    </View>
  );
}

/** Fallback for a live (uncached) cell, tessellating the ribbon ops fresh — used only to compare cost. */
function GridCritterCellLive() {
  const drawing = useMemo(() => buildGeckoDrawing(), []);
  const paintOps = useMemo(
    () => buildGeckoPaintOps(drawing.ops, drawing.totalLineLength, 1),
    [drawing],
  );
  return (
    <View style={[styles.cell, { width: CELL_SIZE, height: CELL_SIZE }]}>
      <Canvas style={{ width: CELL_SIZE, height: CELL_SIZE }}>
        <Group transform={[{ translate: [4, 4] }, { scale: (CELL_SIZE - 8) / 100 }]}>
          {paintOps.map((op, i) => (
            <Path
              key={i}
              path={op.path}
              color={op.color}
              opacity={op.opacity}
              blendMode={op.blendMode}
            />
          ))}
        </Group>
      </Canvas>
    </View>
  );
}

export default function CritterdexGridSpikeScreen() {
  const [listImpl, setListImpl] = useState<ListImplementation>('flash-list');
  const [liveCells, setLiveCells] = useState(false);
  const [cachedImage, setCachedImage] = useState<SkImage | null>(null);
  const [nativeFps, setNativeFps] = useState(0);
  const flashListRef = useRef<FlashListRef<GridCell>>(null);
  const legendListRef = useRef<LegendListRef>(null);

  useEffect(() => {
    const drawing = buildGeckoDrawing();
    const paintOps = buildGeckoPaintOps(drawing.ops, drawing.totalLineLength, 1);
    const size = { width: CELL_SIZE, height: CELL_SIZE };
    const element = (
      <Group transform={[{ scale: CELL_SIZE / 100 }]}>
        {paintOps.map((op, i) => (
          <Path
            key={i}
            path={op.path}
            color={op.color}
            opacity={op.opacity}
            blendMode={op.blendMode}
          />
        ))}
      </Group>
    );
    drawAsImage(element, size)
      .then(setCachedImage)
      .catch((error: unknown) =>
        console.error('critterdex-grid: offscreen snapshot failed', error),
      );
  }, []);

  const frameCount = useSharedValue(0);
  const windowStart = useSharedValue(0);
  const reportFps = useCallback((fps: number) => setNativeFps(fps), []);
  useFrameCallback((frame) => {
    'worklet';
    if (windowStart.value === 0) windowStart.value = frame.timestamp;
    frameCount.value += 1;
    const elapsed = frame.timestamp - windowStart.value;
    if (elapsed >= 1000) {
      runOnJS(reportFps)((frameCount.value / elapsed) * 1000);
      frameCount.value = 0;
      windowStart.value = frame.timestamp;
    }
  }, true);

  const renderItem = useCallback(
    () => (liveCells ? <GridCritterCellLive /> : <GridCritterCell image={cachedImage} />),
    [liveCells, cachedImage],
  );

  const scrollToEnd = useCallback(() => {
    if (listImpl === 'flash-list') flashListRef.current?.scrollToEnd({ animated: true });
    else void legendListRef.current?.scrollToEnd({ animated: true });
  }, [listImpl]);

  return (
    <Scaffold edges={['top', 'bottom']}>
      <View style={styles.container}>
        <Text accessibilityRole="header" variant="h3">
          Critterdex grid spike ({GRID_ROWS * GRID_COLUMNS} cells)
        </Text>
        <View style={styles.buttonRow}>
          <PillButton
            variant="secondary"
            size="sm"
            label={`list: ${listImpl}`}
            onPress={() => setListImpl((v) => (v === 'flash-list' ? 'legend-list' : 'flash-list'))}
          />
          <PillButton
            variant="secondary"
            size="sm"
            label={liveCells ? 'cells: live redraw' : 'cells: cached image'}
            onPress={() => setLiveCells((v) => !v)}
          />
          <PillButton variant="secondary" size="sm" label="scroll to end" onPress={scrollToEnd} />
        </View>
        <Text variant="bodySm">native committed fps: {nativeFps.toFixed(1)}</Text>

        <View style={styles.idleRow}>
          {cachedImage &&
            Array.from({ length: IDLE_CRITTER_COUNT }, (_, i) => (
              <IdleBobbingCritter key={i} image={cachedImage} index={i} />
            ))}
        </View>

        {listImpl === 'flash-list' ? (
          <FlashList
            ref={flashListRef}
            data={gridData}
            numColumns={GRID_COLUMNS}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
          />
        ) : (
          <LegendList
            ref={legendListRef}
            data={gridData}
            numColumns={GRID_COLUMNS}
            keyExtractor={(item: GridCell) => item.id}
            renderItem={renderItem}
          />
        )}
      </View>
    </Scaffold>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 8, padding: 16 },
  buttonRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  idleRow: { flexDirection: 'row', gap: 8, height: CELL_SIZE * 0.6 },
  idleCritter: { width: CELL_SIZE * 0.6, height: CELL_SIZE * 0.6 },
  cell: { alignItems: 'center', justifyContent: 'center' },
});
