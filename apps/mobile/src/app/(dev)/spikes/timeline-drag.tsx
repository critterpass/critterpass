import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const TRACK_WIDTH = 320;
const THUMB_SIZE = 32;
const STEP_MINUTES = 15;
const STEPS_PER_DAY = (24 * 60) / STEP_MINUTES; // 96
const STEP_PX = TRACK_WIDTH / STEPS_PER_DAY;

function formatTime(stepIndex: number): string {
  const totalMinutes = stepIndex * STEP_MINUTES;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Haptics are a native async bridge call, always JS-thread — only the tick trigger itself hops off
// the UI thread; the visual snap below applies in the same UI-thread frame that detects it
// (code-standards.md §7 forbids ad-hoc feedback outside src/motion's feedback bus in production
// code, but that bus does not exist for a per-tick drag pattern like this one, and this screen is
// never imported by a feature — see the ADR).
function triggerTick() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
    // best-effort: haptics are unavailable in the simulator and on some Android OEMs
  });
}

export default function TimelineDragScreen() {
  const rawX = useSharedValue(0);
  const startX = useSharedValue(0);
  const lastStepIndex = useSharedValue(0);
  const [stepIndex, setStepIndex] = useState(0);

  const reportStep = useCallback((index: number) => setStepIndex(index), []);

  const [worstFrameMs, setWorstFrameMs] = useState(0);
  const maxFrameDeltaMs = useSharedValue(0);
  const windowStart = useSharedValue(0);
  const reportFrame = useCallback((maxDeltaMs: number) => setWorstFrameMs(maxDeltaMs), []);
  useFrameCallback((frame) => {
    'worklet';
    if (frame.timeSincePreviousFrame !== null)
      maxFrameDeltaMs.value = Math.max(maxFrameDeltaMs.value, frame.timeSincePreviousFrame);
    if (windowStart.value === 0) windowStart.value = frame.timestamp;
    if (frame.timestamp - windowStart.value >= 700) {
      runOnJS(reportFrame)(maxFrameDeltaMs.value);
      maxFrameDeltaMs.value = 0;
      windowStart.value = frame.timestamp;
    }
  }, true);

  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      startX.value = rawX.value;
    })
    .onChange((event) => {
      'worklet';
      const next = Math.max(0, Math.min(TRACK_WIDTH, startX.value + event.translationX));
      rawX.value = next;
      const snappedStep = Math.round(next / STEP_PX);
      if (snappedStep !== lastStepIndex.value) {
        lastStepIndex.value = snappedStep;
        runOnJS(triggerTick)();
        runOnJS(reportStep)(snappedStep);
      }
    })
    .onFinalize(() => {
      'worklet';
      // Settle exactly onto the snapped step so the thumb never rests mid-tick.
      rawX.value = lastStepIndex.value * STEP_PX;
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.round(rawX.value / STEP_PX) * STEP_PX - THUMB_SIZE / 2 }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: Math.round(rawX.value / STEP_PX) * STEP_PX }));

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Timeline drag spike
      </Text>
      <Text style={styles.body}>
        Drag the handle — snaps to 15-minute steps with a haptic tick on every crossing.
      </Text>
      <Text style={styles.time}>{formatTime(stepIndex)}</Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </GestureDetector>
      </View>
      <Text style={styles.body}>
        worst frame gap while dragging (700 ms window): {worstFrameMs.toFixed(2)} ms (budget 16.6 ms
        @60fps)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 16, padding: 16, alignItems: 'flex-start' },
  title: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 13 },
  time: { fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: {
    width: TRACK_WIDTH,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e4e0d6',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
    backgroundColor: '#4f86ff',
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#221e19',
  },
});
