import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated from 'react-native-reanimated';

import { usePingRings } from '@/motion/patterns/ping-rings';
import { useWaveformBar } from '@/motion/patterns/waveform';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { Halftone } from '../textures/halftone';
import { makeStyles, useTheme } from '../theme';

export type VoiceOrbState = 'listening' | 'thinking' | 'idle';

export interface VoiceOrbProps {
  /** Live audio level, 0 to 1, from the recorder or player meter. */
  readonly level: SharedValue<number>;
  /** Guide sticker in the disc. */
  readonly sticker: ReactNode;
  readonly state: VoiceOrbState;
  /** State word shown and spoken ("Listening"). */
  readonly stateLabel: string;
  /** What the guide heard, quoted under the orb. */
  readonly transcript?: string;
  readonly testID?: string;
}

const BARS = 9;

const useStyles = makeStyles((th) => ({
  orb: {
    width: th.space['32'] * 5,
    height: th.space['32'] * 5,
    borderRadius: th.space['32'] * 3,
    backgroundColor: th.semantic.bg.raised,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: th.space['32'] * 5,
    height: th.space['32'] * 5,
    borderRadius: th.space['32'] * 3,
    borderWidth: th.space['2'],
    borderColor: th.semantic.action.primary,
  },
  bars: { height: th.space['32'], alignItems: 'center' },
  bar: { width: th.space['4'], height: '100%', borderRadius: th.space['2'] },
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

/** The guide listening: sticker in a halftone disc, breathing rings, waveform from the real level. */
export function VoiceOrb({ level, sticker, state, stateLabel, transcript, testID }: VoiceOrbProps) {
  const styles = useStyles();
  const theme = useTheme();
  const rings = usePingRings(state === 'listening');
  return (
    <Stack gap="16" align="center" testID={testID}>
      <View
        importantForAccessibility="no-hide-descendants"
        style={{ alignItems: 'center', justifyContent: 'center' }}
      >
        {state === 'listening'
          ? rings.map((ring) => <Animated.View key={ring.key} style={[styles.ring, ring.style]} />)
          : null}
        <View style={styles.orb}>
          <Halftone />
          {sticker}
        </View>
      </View>
      <Row gap="4" style={styles.bars} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: BARS }, (_, index) => (
          <Bar
            key={index}
            level={level}
            index={index}
            color={state === 'listening' ? theme.semantic.action.primary : theme.color.ink['600']}
          />
        ))}
      </Row>
      <Text
        variant="label"
        color={theme.semantic.action.primary}
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
      >
        {stateLabel}
      </Text>
      {transcript ? (
        <Text variant="bodyLg" accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>
          {`“${transcript}”`}
        </Text>
      ) : null}
    </Stack>
  );
}
