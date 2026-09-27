import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { paperColours } from './paper-colours';

export interface PostcardProps {
  /** The picture side: a photo, a place illustration or a sticker scene. */
  readonly front: ReactNode;
  /** Handwritten greeting on the front ("Greetings from"). */
  readonly caption: string;
  /** Big place name under the greeting ("Bali"). */
  readonly place?: string;
  /** Handwritten message on the back. */
  readonly message: string;
  /** Signature line ("Tokek & the Bali Six"). */
  readonly from: string;
  readonly toLines?: readonly string[];
  /** Postage stamp (`Stamp`) on the back. */
  readonly stamp?: ReactNode;
  /** Start on the back (e.g. when a message has just arrived). @default false */
  readonly startOnBack?: boolean;
  readonly testID?: string;
}

const FLIP_MS = flipDuration();
const PERSPECTIVE = 1600;
const flipEasing = bezierEasing(tokens.motion.easing.inOut);

function flipDuration(): number {
  const flip = tokens.motion.transition.flip as {
    readonly enter?: { readonly durationMs?: number };
  };
  const ms = flip.enter?.durationMs;
  if (ms === undefined) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing throw, never rendered.
    throw new Error('design-tokens: motion.transition.flip.enter.durationMs missing');
  }
  return ms;
}

const useStyles = makeStyles((t) => ({
  card: { aspectRatio: 1.5, borderRadius: t.radius.md },
  side: {
    ...StyleSheet.absoluteFill,
    borderRadius: t.radius.md,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
    backgroundColor: t.color.paper.bright,
  },
  caption: { position: 'absolute', start: t.space['14'], top: t.space['12'] },
  back: { flexDirection: 'row', padding: t.space['14'], gap: t.space['12'] },
  divider: { width: 1, backgroundColor: paperColours(t).border },
  address: {
    borderBottomWidth: 1,
    borderColor: paperColours(t).border,
    paddingBottom: t.space['2'],
  },
}));

/** A two-sided postcard that flips (rotateY, perspective 1600) on tap or the activate action. */
export function Postcard({
  front,
  caption,
  place,
  message,
  from,
  toLines = [],
  stamp,
  startOnBack = false,
  testID,
}: PostcardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const [back, setBack] = useState(startOnBack);
  const turn = useSharedValue(startOnBack ? 180 : 0);

  useEffect(() => {
    turn.value = reduced
      ? back
        ? 180
        : 0
      : withTiming(back ? 180 : 0, { duration: FLIP_MS, easing: flipEasing });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [back, reduced]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: PERSPECTIVE }, { rotateY: `${turn.value}deg` }],
    opacity: turn.value < 90 ? 1 : 0,
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: PERSPECTIVE }, { rotateY: `${turn.value - 180}deg` }],
    opacity: turn.value >= 90 ? 1 : 0,
  }));

  const label = back ? `${message}, ${from}` : [caption, place].filter(Boolean).join(' ');
  return (
    <PressScale
      testID={testID}
      onPress={() => setBack((value) => !value)}
      widthClass="wide"
      accessibilityLabel={label}
      accessibilityHint={t({ id: 'common.postcard.flip', message: 'Flips the postcard' })}
      style={styles.card}
    >
      <SurfaceToneProvider value="paper">
        <Animated.View style={[styles.side, frontStyle]}>
          {front}
          <View style={styles.caption}>
            <Text variant="voicePostcard" color={theme.color.paper.bright}>
              {caption}
            </Text>
            {place ? (
              <Text variant="displayXl" color={theme.color.yellow}>
                {place}
              </Text>
            ) : null}
          </View>
        </Animated.View>
        <Animated.View style={[styles.side, styles.back, backStyle]}>
          <Stack flex={1} gap="8">
            <Text variant="voice" color={theme.color.paper.ink}>
              {message}
            </Text>
            <Text variant="voiceSignature" color={theme.color.rust.darkened}>
              {from}
            </Text>
          </Stack>
          <View style={styles.divider} />
          <Stack flex={1} gap="10">
            <Row justify="flex-end">{stamp}</Row>
            {toLines.map((line) => (
              <View key={line} style={styles.address}>
                <Text variant="monoData">{line}</Text>
              </View>
            ))}
          </Stack>
        </Animated.View>
      </SurfaceToneProvider>
    </PressScale>
  );
}
