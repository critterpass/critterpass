import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  IslandToast,
  LOOP_PRESET_IDS,
  SOUND_CUE_IDS,
  impact,
  motionFreeze,
  setMotionFreeze,
  setSlowmoMultiplier,
  slowmoMultiplier,
  toast,
  useLoop,
  useMotionMode,
  type LoopPresetId,
  type MotionMode,
  type SlowmoMultiplier,
  type SoundCueId,
} from '@/motion';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const MOTION_MODES: readonly MotionMode[] = ['full', 'reduced', 'off'];
const SLOWMO_VALUES: readonly SlowmoMultiplier[] = [1, 2, 4];

function ModeRow() {
  const [mode, setMode] = useMotionMode();
  return (
    <View style={styles.row}>
      {MOTION_MODES.map((value) => (
        <Pressable
          key={value}
          testID={`mode-${value}`}
          onPress={() => setMode(value)}
          style={[styles.chip, mode === value && styles.chipActive]}
        >
          <Text style={styles.chipLabel}>{value}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SlowmoRow() {
  const [multiplier, setMultiplier] = useState<SlowmoMultiplier>(slowmoMultiplier.value);
  const [frozen, setFrozen] = useState(motionFreeze.value);
  return (
    <View style={styles.row}>
      {SLOWMO_VALUES.map((value) => (
        <Pressable
          key={value}
          testID={`slowmo-${value}x`}
          onPress={() => {
            setSlowmoMultiplier(value);
            setMultiplier(value);
          }}
          style={[styles.chip, multiplier === value && styles.chipActive]}
        >
          <Text style={styles.chipLabel}>{value}x</Text>
        </Pressable>
      ))}
      <Pressable
        testID="motion-freeze-toggle"
        onPress={() => {
          const next = !frozen;
          setMotionFreeze(next);
          setFrozen(next);
        }}
        style={[styles.chip, frozen && styles.chipActive]}
      >
        <Text style={styles.chipLabel}>
          <Trans id="motion.motionLab.freeze">freeze</Trans>
        </Text>
      </Pressable>
    </View>
  );
}

function LoopTile({ id }: { readonly id: LoopPresetId }) {
  const animatedStyle = useLoop(id);
  return (
    <View style={styles.tile} testID={`loop-${id}`}>
      <Animated.View style={[styles.tileSwatch, animatedStyle]} />
      <Text style={styles.tileLabel}>{id}</Text>
    </View>
  );
}

function CueButton({ id }: { readonly id: SoundCueId }) {
  return (
    <Pressable testID={`cue-${id}`} onPress={() => impact(id)} style={styles.cueChip}>
      <Text style={styles.chipLabel}>{id}</Text>
    </Pressable>
  );
}

function ToastDemoButton() {
  return (
    <Pressable
      testID="show-toast-button"
      onPress={() =>
        toast.show({
          id: `motion-lab-${Date.now()}`,
          title: t({ id: 'motion.motionLab.demoToastTitle', message: 'Pass issued' }),
          subtitle: t({
            id: 'motion.motionLab.demoToastSubtitle',
            message: 'motion-lab demo toast',
          }),
          action: {
            label: t({ id: 'motion.motionLab.demoToastAction', message: 'Open' }),
            onPress: () => impact('success'),
          },
        })
      }
      style={styles.chip}
    >
      <Text style={styles.chipLabel}>
        <Trans id="motion.motionLab.showToast">show toast</Trans>
      </Text>
    </Pressable>
  );
}

/**
 * Exercises the whole motion runtime for manual QA and Maestro (`e2e/motion/motion-lab.yaml`):
 * every loop preset, every feedback cue, slowmo/motion-freeze and the island toast, at any motion
 * mode. Dev-only (excluded from production per the marker above); wraps its own
 * `GestureHandlerRootView`/`SafeAreaProvider` since the app shell doesn't mount them yet (phase 7).
 */
export default function MotionLabScreen() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.heading}>
            <Trans id="motion.motionLab.title">Motion lab</Trans>
          </Text>

          <Text style={styles.sectionTitle}>
            <Trans id="motion.motionLab.mode">Motion mode</Trans>
          </Text>
          <ModeRow />

          <Text style={styles.sectionTitle}>
            <Trans id="motion.motionLab.slowmo">Slowmo</Trans>
          </Text>
          <SlowmoRow />

          <Text style={styles.sectionTitle}>
            <Trans id="motion.motionLab.loops">Loop presets</Trans>
          </Text>
          <View style={styles.grid}>
            {LOOP_PRESET_IDS.map((id) => (
              <LoopTile key={id} id={id} />
            ))}
          </View>

          <Text style={styles.sectionTitle}>
            <Trans id="motion.motionLab.cues">Feedback cues</Trans>
          </Text>
          <View style={styles.grid}>
            {SOUND_CUE_IDS.map((id) => (
              <CueButton key={id} id={id} />
            ))}
          </View>

          <Text style={styles.sectionTitle}>
            <Trans id="motion.motionLab.toast">Island toast</Trans>
          </Text>
          <ToastDemoButton />
        </ScrollView>
        <IslandToast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Dev-only route (see the marker above); plain StyleSheet, no @cp/design-tokens import — route files
// don't import tokens directly (docs/system-architecture.md §3), matching `(dev)/_probe.tsx`.
const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 8,
  },
  heading: {
    // No explicit fontSize (route files may not import @cp/design-tokens; see (dev)/_probe.tsx) —
    // weight alone distinguishes it from body text at the platform default size.
    fontWeight: 'bold',
    marginBottom: 8,
  },
  sectionTitle: {
    fontWeight: '600',
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: 'gray',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: {
    backgroundColor: 'black',
  },
  chipLabel: {
    color: 'black',
  },
  cueChip: {
    borderWidth: 1,
    borderColor: 'darkgray',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tile: {
    alignItems: 'center',
    width: 72,
  },
  tileSwatch: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'slateblue',
  },
  tileLabel: {
    marginTop: 4,
    textAlign: 'center',
  },
});
