/**
 * The top of voice mode (3j-2): the guide's sticker large on a halftone disc inside one wide,
 * quiet ring, rings that breathe while it listens, and a row of bars that follows the
 * microphone's level.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated from 'react-native-reanimated';

import { usePingRings } from '@/motion/patterns/ping-rings';
import { useWaveformBar } from '@/motion/patterns/waveform';
import { Row, Stack, makeStyles, useTheme } from '@/ui';
import { Halftone } from '@/ui/textures/halftone';

const BARS = 17;

/** The guide's sticker on the stage: it nearly fills the disc, as in the render. */
export const VOICE_STICKER_SIZE = 144;

const useStyles = makeStyles((t) => ({
  stage: { alignItems: 'center', justifyContent: 'center' },
  disc: {
    width: t.space['32'] * 6,
    height: t.space['32'] * 6,
    borderRadius: t.space['32'] * 3,
    backgroundColor: t.semantic.bg.raised,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: t.space['32'] * 6,
    height: t.space['32'] * 6,
    borderRadius: t.space['32'] * 3,
    borderWidth: t.space['2'],
    borderColor: t.semantic.action.primary,
  },
  // 3j-2's wide ring: wider than the screen, so only its arcs show above and below the disc.
  orbit: {
    position: 'absolute',
    width: t.space['32'] * 18,
    height: t.space['32'] * 18,
    borderRadius: t.space['32'] * 9,
    borderWidth: 1,
    borderColor: t.semantic.border.decorative,
  },
  bars: { height: t.space['32'], alignItems: 'center' },
  bar: { width: t.space['4'], height: '100%', borderRadius: t.space['2'] },
}));

function Bar({
  level,
  index,
  color,
}: {
  readonly level: SharedValue<number>;
  readonly index: number;
  readonly color: string;
}) {
  const styles = useStyles();
  const style = useWaveformBar(level, index, BARS);
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

export interface VoiceStageProps {
  readonly sticker: ReactNode;
  /** Live audio level, 0 to 1. */
  readonly level: SharedValue<number>;
  readonly listening: boolean;
}

export function VoiceStage({ sticker, level, listening }: VoiceStageProps) {
  const styles = useStyles();
  const theme = useTheme();
  const rings = usePingRings(listening);
  return (
    <Stack gap="16" align="center" importantForAccessibility="no-hide-descendants">
      <View style={styles.stage}>
        <View style={styles.orbit} pointerEvents="none" />
        {listening
          ? rings.map((ring) => <Animated.View key={ring.key} style={[styles.ring, ring.style]} />)
          : null}
        <View style={styles.disc}>
          <Halftone variant="dark" />
          {sticker}
        </View>
      </View>
      <Row gap="6" style={styles.bars}>
        {Array.from({ length: BARS }, (_, index) => (
          <Bar key={index} level={level} index={index} color={theme.semantic.action.primary} />
        ))}
      </Row>
    </Stack>
  );
}
