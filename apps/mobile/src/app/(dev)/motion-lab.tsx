import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
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
import { makeStyles, Scaffold, Text, useTheme } from '@/ui';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const MOTION_MODES: readonly MotionMode[] = ['full', 'reduced', 'off'];
const SLOWMO_VALUES: readonly SlowmoMultiplier[] = [1, 2, 4];

/** A chip label that stays legible on the selected chip's accent fill. */
function ChipLabel({
  active = false,
  children,
}: {
  readonly active?: boolean;
  readonly children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Text variant="bodySm" color={active ? theme.semantic.text.onAccent : undefined}>
      {children}
    </Text>
  );
}

function ModeRow() {
  const styles = useStyles();
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
          <ChipLabel active={mode === value}>{value}</ChipLabel>
        </Pressable>
      ))}
    </View>
  );
}

function SlowmoRow() {
  const styles = useStyles();
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
          <ChipLabel active={multiplier === value}>{value}x</ChipLabel>
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
        <ChipLabel active={frozen}>
          <Trans id="motion.motionLab.freeze">freeze</Trans>
        </ChipLabel>
      </Pressable>
    </View>
  );
}

function LoopTile({ id }: { readonly id: LoopPresetId }) {
  const styles = useStyles();
  const animatedStyle = useLoop(id);
  return (
    <View style={styles.tile} testID={`loop-${id}`}>
      <Animated.View style={[styles.tileSwatch, animatedStyle]} />
      <Text variant="caption" style={styles.tileLabel}>
        {id}
      </Text>
    </View>
  );
}

function CueButton({ id }: { readonly id: SoundCueId }) {
  const styles = useStyles();
  return (
    <Pressable testID={`cue-${id}`} onPress={() => impact(id)} style={styles.cueChip}>
      <ChipLabel>{id}</ChipLabel>
    </Pressable>
  );
}

function ToastDemoButton() {
  const styles = useStyles();
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
      <ChipLabel>
        <Trans id="motion.motionLab.showToast">show toast</Trans>
      </ChipLabel>
    </Pressable>
  );
}

/** A title with no subtitle, long enough to need its second line. */
function LongToastDemoButton() {
  const styles = useStyles();
  return (
    <Pressable
      testID="show-long-toast-button"
      onPress={() =>
        toast.show({
          id: `motion-lab-long-${Date.now()}`,
          title: t({
            id: 'motion.motionLab.demoLongToastTitle',
            message: "The trip is full. You're number 3 in line for a seat.",
          }),
        })
      }
      style={styles.chip}
    >
      <ChipLabel>
        <Trans id="motion.motionLab.showLongToast">show two-line toast</Trans>
      </ChipLabel>
    </Pressable>
  );
}

/**
 * Exercises the whole motion runtime for manual QA and Maestro (`e2e/motion/motion-lab.yaml`):
 * every loop preset, every feedback cue, slowmo/motion-freeze and the island toast, at any motion
 * mode. Dev-only (excluded from production per the marker above); wraps its own
 * `GestureHandlerRootView`/`SafeAreaProvider` since the app shell doesn't mount them near the root yet.
 */
export default function MotionLabScreen() {
  const styles = useStyles();
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <Scaffold edges={['top', 'bottom']}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" variant="h2" style={styles.heading}>
              <Trans id="motion.motionLab.title">Motion lab</Trans>
            </Text>

            <Text variant="title" style={styles.sectionTitle}>
              <Trans id="motion.motionLab.mode">Motion mode</Trans>
            </Text>
            <ModeRow />

            <Text variant="title" style={styles.sectionTitle}>
              <Trans id="motion.motionLab.slowmo">Slowmo</Trans>
            </Text>
            <SlowmoRow />

            <Text variant="title" style={styles.sectionTitle}>
              <Trans id="motion.motionLab.loops">Loop presets</Trans>
            </Text>
            <View style={styles.grid}>
              {LOOP_PRESET_IDS.map((id) => (
                <LoopTile key={id} id={id} />
              ))}
            </View>

            <Text variant="title" style={styles.sectionTitle}>
              <Trans id="motion.motionLab.cues">Feedback cues</Trans>
            </Text>
            <View style={styles.grid}>
              {SOUND_CUE_IDS.map((id) => (
                <CueButton key={id} id={id} />
              ))}
            </View>

            <Text variant="title" style={styles.sectionTitle}>
              <Trans id="motion.motionLab.toast">Island toast</Trans>
            </Text>
            <ToastDemoButton />
            <LongToastDemoButton />
          </ScrollView>
          <IslandToast Text={Text} />
        </Scaffold>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Dev-only route (see the marker above): themed through the component library, never
// @cp/design-tokens directly (docs/system-architecture.md §3).
const useStyles = makeStyles((t) => ({
  flex: {
    flex: 1,
  },
  content: {
    padding: t.size.gutter,
    gap: t.space['8'],
  },
  heading: {
    marginBottom: t.space['8'],
  },
  sectionTitle: {
    marginTop: t.space['12'],
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space['8'],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space['8'],
  },
  chip: {
    borderRadius: t.radius.md,
    paddingVertical: t.space['6'],
    paddingHorizontal: t.space['12'],
    backgroundColor: t.semantic.bg.control,
  },
  chipActive: {
    backgroundColor: t.semantic.action.primary,
  },
  cueChip: {
    borderWidth: 1,
    borderColor: t.semantic.border.control,
    borderRadius: t.radius.md,
    paddingVertical: t.space['4'],
    paddingHorizontal: t.space['8'],
  },
  tile: {
    alignItems: 'center',
    width: 72,
  },
  tileSwatch: {
    width: 40,
    height: 40,
    borderRadius: t.radius.md,
    backgroundColor: 'slateblue',
  },
  tileLabel: {
    marginTop: t.space['4'],
    textAlign: 'center',
  },
}));
