import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  measure,
  runOnJS,
  runOnUI,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

type Mode = 'teleport-overlay' | 'shared-element' | 'apple-zoom';
const MODES: readonly Mode[] = ['teleport-overlay', 'shared-element', 'apple-zoom'];
const CARD_COLORS = ['#4f86ff', '#ff5fa8', '#54d6a4', '#ffd84a', '#ff9a4d', '#9f6bff'];

// design-system.md §3.3 "zoom" transition token: card → detail, 560 ms, fade first 35 %.
const ZOOM_DURATION_MS = 560;
const CARD_RADIUS = 22;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One grid card; owns its own measure ref (hooks must live at one call site per card, not in a loop). */
function GrowCard({ color, index, onPress }: { color: string; index: number; onPress: (index: number, rect: Rect) => void }) {
  const animatedRef = useAnimatedRef<Animated.View>();

  const handlePress = useCallback(() => {
    runOnUI(() => {
      'worklet';
      const measured = measure(animatedRef);
      if (measured) runOnJS(onPress)(index, { x: measured.pageX, y: measured.pageY, width: measured.width, height: measured.height });
    })();
  }, [animatedRef, index, onPress]);

  return (
    <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel={`Card ${index + 1}`}>
      <Animated.View ref={animatedRef} style={[styles.card, { backgroundColor: color }]} />
    </Pressable>
  );
}

/** Custom teleport overlay: clones the tapped card's measured rect and grows it to fill the screen. */
function TeleportOverlay({ sourceRect, color, onClosed }: { sourceRect: Rect; color: string; onClosed: () => void }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: ZOOM_DURATION_MS });
  }, [progress]);

  const overlayStyle = useAnimatedStyle(() => {
    const x = interpolate(progress.value, [0, 1], [sourceRect.x, 0], Extrapolation.CLAMP);
    const y = interpolate(progress.value, [0, 1], [sourceRect.y, 0], Extrapolation.CLAMP);
    const width = interpolate(progress.value, [0, 1], [sourceRect.width, screenWidth], Extrapolation.CLAMP);
    const height = interpolate(progress.value, [0, 1], [sourceRect.height, screenHeight], Extrapolation.CLAMP);
    const borderRadius = interpolate(progress.value, [0, 1], [CARD_RADIUS, 0], Extrapolation.CLAMP);
    return { position: 'absolute', left: x, top: y, width, height, borderRadius, backgroundColor: color };
  });
  const contentStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0, 0.35, 1], [0, 1, 1], Extrapolation.CLAMP) }));

  const close = useCallback(() => {
    // Reanimated SharedValue.value is a deliberately mutable escape hatch outside React's render
    // state (this is the documented way to start an animation from a JS event handler);
    // eslint-plugin-react-hooks' React-Compiler-era rules do not yet recognise that type as exempt.
    // eslint-disable-next-line react-hooks/immutability
    progress.value = withTiming(0, { duration: ZOOM_DURATION_MS * (460 / 560) }, (finished) => {
      if (finished) runOnJS(onClosed)();
    });
  }, [onClosed, progress]);

  return (
    <Animated.View style={overlayStyle}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Close detail">
        <Animated.View style={[styles.detailContent, contentStyle]}>
          <Text style={styles.detailTitle}>Detail (teleport overlay)</Text>
          <Text style={styles.detailBody}>Tap anywhere to close — reverses the same shared progress value mid-flight.</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** Reanimated's `sharedTransitionTag` mechanism: the grid card and the detail view share a tag and
 * swap in the same commit (conditional render, not a route change — expo-router's default
 * native-stack renders screens as native view controllers, which this layout-animation mechanism
 * does not reach into; see the ADR for why this was tested as an in-screen reveal instead). */
function SharedElementDemo({ selected, onSelect }: { selected: number | null; onSelect: (index: number | null) => void }) {
  if (selected === null) {
    return (
      <View style={styles.grid}>
        {CARD_COLORS.map((color, i) => (
          <Pressable key={i} onPress={() => onSelect(i)} accessibilityRole="button" accessibilityLabel={`Card ${i + 1}`}>
            <Animated.View sharedTransitionTag={`grow-card-${i}`} style={[styles.card, { backgroundColor: color }]} />
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <Pressable style={styles.detailFill} onPress={() => onSelect(null)} accessibilityRole="button" accessibilityLabel="Close detail">
      <Animated.View sharedTransitionTag={`grow-card-${selected}`} style={[styles.detailFill, { backgroundColor: CARD_COLORS[selected] }]}>
        <View style={styles.detailContent}>
          <Text style={styles.detailTitle}>Detail (Reanimated shared element)</Text>
          <Text style={styles.detailBody}>Tap anywhere to close.</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function GrowIntoPageScreen() {
  const [mode, setMode] = useState<Mode>('teleport-overlay');
  const [teleport, setTeleport] = useState<{ index: number; rect: Rect } | null>(null);
  const [sharedSelected, setSharedSelected] = useState<number | null>(null);

  const [p95FrameMs, setP95FrameMs] = useState(0);
  const maxFrameDeltaMs = useSharedValue(0);
  const windowStart = useSharedValue(0);
  const reportFrame = useCallback((maxDeltaMs: number) => setP95FrameMs(maxDeltaMs), []);
  useFrameCallback((frame) => {
    'worklet';
    if (frame.timeSincePreviousFrame !== null) maxFrameDeltaMs.value = Math.max(maxFrameDeltaMs.value, frame.timeSincePreviousFrame);
    if (windowStart.value === 0) windowStart.value = frame.timestamp;
    if (frame.timestamp - windowStart.value >= 700) {
      runOnJS(reportFrame)(maxFrameDeltaMs.value);
      maxFrameDeltaMs.value = 0;
      windowStart.value = frame.timestamp;
    }
  }, true);

  const handleCardPress = useCallback((index: number, rect: Rect) => setTeleport({ index, rect }), []);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>
          Grow-into-page transition spike
        </Text>
        <View style={styles.buttonRow}>
          {MODES.map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.modeButton, mode === m && styles.modeButtonActive]}>
              <Text style={[styles.modeLabel, mode === m && styles.modeLabelActive]}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.body}>worst frame gap (700 ms window): {p95FrameMs.toFixed(2)} ms (budget 16.6 ms @60fps)</Text>

        {mode === 'teleport-overlay' && (
          <View style={styles.grid}>
            {CARD_COLORS.map((color, i) => (
              <GrowCard key={i} color={color} index={i} onPress={handleCardPress} />
            ))}
          </View>
        )}
        {mode === 'shared-element' && <SharedElementDemo selected={sharedSelected} onSelect={setSharedSelected} />}
        {mode === 'apple-zoom' && (
          <View style={styles.grid}>
            <Link href="/(dev)/spikes/grow-into-page-detail" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel="Open with Apple Zoom">
                <Link.Trigger withAppleZoom>
                  {/* Link.Trigger forwards this child through expo-router's <Slot>, which throws on
                   * an array `style` prop — flatten it first (a real, source-verified constraint,
                   * not an assumption; see the ADR). */}
                  <Animated.View style={StyleSheet.flatten([styles.card, { backgroundColor: CARD_COLORS[0] }])} />
                </Link.Trigger>
              </Pressable>
            </Link>
            <Text style={styles.body}>
              Link.AppleZoom is wired above; see the ADR — expo-router 58.0.8 hard-codes its enabling flag to
              false, so this currently navigates with the plain push transition, not a zoom.
            </Text>
          </View>
        )}
      </ScrollView>

      {teleport ? (
        <TeleportOverlay sourceRect={teleport.rect} color={CARD_COLORS[teleport.index] ?? '#4f86ff'} onClosed={() => setTeleport(null)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flexGrow: 1, gap: 12, padding: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 13 },
  buttonRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  modeButtonActive: { backgroundColor: '#221e19' },
  modeLabel: { fontSize: 13 },
  modeLabelActive: { color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: 100, height: 100, borderRadius: CARD_RADIUS },
  detailFill: { flex: 1, minHeight: 400 },
  detailContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  detailTitle: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center' },
  detailBody: { fontSize: 14, color: '#fff', textAlign: 'center' },
});
