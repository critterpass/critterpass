import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ScrollView, StyleSheet, View } from 'react-native';
import { runOnJS, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { buildGeckoDrawing } from './critter-gecko-ops';
import { buildGeckoPaintOps } from './critter-skia-paint';
import { Scaffold, Stack, Text } from '@/ui';
import { Card } from '@/ui/cards/Card';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const CANVAS_SIZE = 220;
const DRAW_ON_MS = 1500;
const BLINK_EVERY_MS = 2900;
const BLINK_HOLD_MS = 150;

/** Eased 0..1 progress, matching doodles.js `play()`'s quadratic in/out. */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export default function CritterSpikeScreen() {
  const openDrawing = useMemo(() => buildGeckoDrawing(), []);
  const closedDrawing = useMemo(() => buildGeckoDrawing({ closed: true }), []);
  const [progress, setProgress] = useState(0);
  const [closed, setClosed] = useState(false);
  const [lastBuildMs, setLastBuildMs] = useState(0);
  const [nativeFps, setNativeFps] = useState(0);
  const [running, setRunning] = useState(false);
  const rafHandle = useRef<number | null>(null);

  // Native-side (UI thread) frame counter — independent of the JS rAF loop below, so it reflects
  // real committed frames rather than how often this component happens to re-render.
  const frameCount = useSharedValue(0);
  const windowStart = useSharedValue(0);
  const reportFps = useCallback((fps: number) => setNativeFps(fps), []);
  useFrameCallback((frame) => {
    'worklet';
    if (windowStart.value === 0) windowStart.value = frame.timestamp;
    frameCount.value += 1;
    const elapsed = frame.timestamp - windowStart.value;
    if (elapsed >= 1000) {
      const fps = (frameCount.value / elapsed) * 1000;
      runOnJS(reportFps)(fps);
      frameCount.value = 0;
      windowStart.value = frame.timestamp;
    }
  }, true);

  useEffect(() => {
    const id = setInterval(() => {
      setClosed(true);
      setTimeout(() => setClosed(false), BLINK_HOLD_MS);
    }, BLINK_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  const startDrawOn = useCallback(() => {
    if (rafHandle.current !== null) cancelAnimationFrame(rafHandle.current);
    setRunning(true);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DRAW_ON_MS);
      setProgress(easeInOut(t));
      if (t < 1) {
        rafHandle.current = requestAnimationFrame(tick);
      } else {
        setRunning(false);
        rafHandle.current = null;
      }
    };
    rafHandle.current = requestAnimationFrame(tick);
  }, []);

  useEffect(
    () => () => {
      if (rafHandle.current !== null) cancelAnimationFrame(rafHandle.current);
    },
    [],
  );

  const drawing = closed ? closedDrawing : openDrawing;
  // Pure for render: no timing here (React may invoke this more than once per commit).
  const paintOps = useMemo(
    () => buildGeckoPaintOps(drawing.ops, drawing.totalLineLength, progress),
    [drawing, progress],
  );

  // Timing lives in an effect, recomputing once more purely to measure the JS-thread cost of NOT
  // caching this frame's paint — deferred to the next tick so the setState here can't cascade into
  // the same commit.
  useEffect(() => {
    const start = performance.now();
    buildGeckoPaintOps(drawing.ops, drawing.totalLineLength, progress);
    const buildMs = performance.now() - start;
    const raf = requestAnimationFrame(() => setLastBuildMs(buildMs));
    return () => cancelAnimationFrame(raf);
  }, [drawing, progress]);

  return (
    <Scaffold edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" variant="h3">
          Skia critter painter spike
        </Text>
        <Text variant="bodySm">
          Re-tessellates every ink stroke's brush ribbon on each animation frame (no image caching)
          — the worst-case draw-on cost this spike measures against the reference devices in the
          ADR.
        </Text>

        <Canvas style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
          <Group transform={[{ scale: CANVAS_SIZE / 100 }]}>
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

        <View style={styles.buttonRow}>
          <Button
            title={running ? 'Drawing on…' : 'Play draw-on'}
            onPress={startDrawOn}
            disabled={running}
          />
        </View>

        <Card>
          <Stack gap="4">
            <Text variant="eyebrow">native committed fps (1 s window)</Text>
            <Text variant="rowTitle">{nativeFps.toFixed(1)}</Text>
          </Stack>
        </Card>
        <Card>
          <Stack gap="4">
            <Text variant="eyebrow">JS paint-op rebuild (last frame)</Text>
            <Text variant="rowTitle">{lastBuildMs.toFixed(2)} ms</Text>
            <Text variant="bodySm">{paintOps.length} filled polygons this frame</Text>
          </Stack>
        </Card>
      </ScrollView>
    </Scaffold>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 12, padding: 16, alignItems: 'flex-start' },
  buttonRow: { alignSelf: 'flex-start' },
});
