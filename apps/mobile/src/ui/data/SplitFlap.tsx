import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useSplitFlapCharacter } from '@/motion/patterns/split-flap';

import type { TextVariant } from '../text/Text';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';

const useStyles = makeStyles((th) => ({
  row: { flexDirection: 'row', gap: th.space['2'] },
  tile: {
    minWidth: th.space['20'],
    paddingHorizontal: th.space['2'],
    alignItems: 'center',
    borderRadius: th.radius.xs,
    backgroundColor: th.color.ink['950'],
  },
  seam: {
    position: 'absolute',
    start: 0,
    end: 0,
    top: '50%',
    height: th.space['2'],
    backgroundColor: th.semantic.bg.base,
  },
}));

function FlapTile({ char, variant }: { readonly char: string; readonly variant: TextVariant }) {
  const styles = useStyles();
  const { displayChar, style } = useSplitFlapCharacter(char);
  return (
    <Animated.View style={[styles.tile, style]}>
      <Text variant={variant}>{displayChar === ' ' ? ' ' : displayChar}</Text>
      <View style={styles.seam} />
    </Animated.View>
  );
}

export interface SplitFlapProps {
  /** Board text (gate, time, status); each position flips to its new character. */
  readonly value: string;
  /** Pads to a fixed number of tiles so the board never reflows. */
  readonly length?: number;
  /** @default 'h3' */
  readonly variant?: TextVariant;
  /** Spoken context ("Gate"). */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/** Departure-board text; reads as the plain value, never tile by tile. */
export function SplitFlap({
  value,
  length,
  variant = 'h3',
  accessibilityLabel,
  testID,
}: SplitFlapProps) {
  const styles = useStyles();
  const text = length === undefined ? value : value.padEnd(length).slice(0, length);
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={[accessibilityLabel, value.trim()].filter(Boolean).join(', ')}
      style={styles.row}
    >
      {text.split('').map((char, index) => (
        <FlapTile key={index} char={char} variant={variant} />
      ))}
    </View>
  );
}
