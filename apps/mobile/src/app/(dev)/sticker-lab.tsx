import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useState } from 'react';
import { Button, StyleSheet, View } from 'react-native';
import { runOnJS, useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';

import type { DexCell } from '@/ui/sticker/dex';
import { DEX_CELLS, HERO_CELLS } from '@/ui/sticker/dex';
import { getDefaultSkiaCache, Sticker } from '@/ui/sticker/Sticker';
import { Scaffold, Text } from '@/ui';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const CELL_SIZE = 60;
const GRID_COLUMNS = 5;
const HERO_SIZE = 96;
const DRAW_ON_DURATION_MS = 1400;
const MEMORY_SAMPLE_INTERVAL_MS = 500;

/** Rolling 1s fps counter, matching the pattern already proven in `(dev)/spikes/critterdex-grid.tsx` — `useFrameCallback` runs on the UI thread, `runOnJS` hops back to report a rounded value once a window closes rather than re-rendering every frame. */
function useFps(): number {
  const [fps, setFps] = useState(0);
  const frameCount = useSharedValue(0);
  const windowStart = useSharedValue(0);
  const report = useCallback((value: number) => setFps(value), []);
  useFrameCallback((frame) => {
    'worklet';
    if (windowStart.value === 0) windowStart.value = frame.timestamp;
    frameCount.value += 1;
    const elapsed = frame.timestamp - windowStart.value;
    if (elapsed >= 1000) {
      runOnJS(report)((frameCount.value / elapsed) * 1000);
      frameCount.value = 0;
      windowStart.value = frame.timestamp;
    }
  }, true);
  return fps;
}

/** Polls the default sticker cache's memory-tier usage — a `setInterval` (not a frame callback) since this only needs to move a few times a second, not every frame. */
function useCacheMemoryBytes(): number {
  const [bytes, setBytes] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setBytes(getDefaultSkiaCache().memoryBytes),
      MEMORY_SAMPLE_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, []);
  return bytes;
}

function HeroDrawOn({ testId, cell }: { testId: string; cell: DexCell }) {
  const progress = useSharedValue(0);
  const replay = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- a Reanimated shared value's `.value` setter, not React state.
    progress.value = 0;
    progress.value = withTiming(1, { duration: DRAW_ON_DURATION_MS });
  }, [progress]);
  return (
    <View style={styles.heroColumn}>
      <Sticker
        kind={cell.kind}
        name={cell.name}
        seed={cell.seed}
        pose="wave"
        size={HERO_SIZE}
        drawProgress={progress}
      />
      <Button testID={testId} title="draw on" onPress={replay} />
    </View>
  );
}

/**
 * Device-bench screen: proves `<Sticker>` holds up under real load — the full 150-critter dex
 * scrolling, 2 concurrent hero draw-ons, and a "closed-eye storm" that forces every visible cell to
 * miss its cache simultaneously (the worst case the memory LRU sees in the real app: a blink swap
 * hitting every visible cell in one frame). The fps/cache readouts are a rough on-screen sanity
 * check, not the founder's real device numbers — those come from the capture script
 * (e2e/critters/capture-perf.sh) run on physical hardware.
 */
export default function StickerLabScreen() {
  const [closedEyesStorm, setClosedEyesStorm] = useState(false);
  const fps = useFps();
  const cacheBytes = useCacheMemoryBytes();

  const renderItem = useCallback(
    ({ item }: { item: DexCell }) => (
      <Sticker
        kind={item.kind}
        name={item.name}
        seed={item.seed}
        pose="idle"
        size={CELL_SIZE}
        closedEyes={closedEyesStorm}
      />
    ),
    [closedEyesStorm],
  );

  return (
    <Scaffold edges={['top', 'bottom']}>
      <View style={styles.container}>
        <Text accessibilityRole="header" variant="h3">
          Sticker lab ({DEX_CELLS.length} critters)
        </Text>
        <Text testID="sticker-lab-fps" variant="monoData">
          fps: {fps.toFixed(1)}
        </Text>
        <Text testID="sticker-lab-cache-bytes" variant="monoData">
          cache: {(cacheBytes / (1024 * 1024)).toFixed(2)} MB
        </Text>

        <View style={styles.heroRow}>
          <HeroDrawOn testId="sticker-lab-hero-1" cell={HERO_CELLS[0]} />
          <HeroDrawOn testId="sticker-lab-hero-2" cell={HERO_CELLS[1]} />
        </View>

        <Button
          testID="sticker-lab-closed-eyes-storm"
          title={closedEyesStorm ? 'eyes: closed (storm on)' : 'eyes: open'}
          onPress={() => setClosedEyesStorm((value) => !value)}
        />

        {/* `testID` on the wrapping View, not `<FlashList>` itself: FlashList's own prop types don't
          mention `testID` at all (checked its .d.ts), so there's no guarantee it forwards one to a
          real native accessibility identifier — a plain View reliably does. */}
        <View testID="sticker-lab-grid" style={styles.grid}>
          <FlashList
            data={DEX_CELLS}
            numColumns={GRID_COLUMNS}
            keyExtractor={(item) => item.kind}
            renderItem={renderItem}
          />
        </View>
      </View>
    </Scaffold>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 8, padding: 16 },
  heroRow: { flexDirection: 'row', gap: 16 },
  heroColumn: { alignItems: 'center', gap: 4 },
  grid: { flex: 1 },
});
