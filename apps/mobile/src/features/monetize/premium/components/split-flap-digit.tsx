/**
 * A split-flap tile: two dark halves with a seam, one big glyph (9.21's "3"; 3.09's code tiles use
 * the same build at 58 high). Ink on these stays dark in both modes.
 */
import { StyleSheet, View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';

import { MONETIZE_INK } from '../monetize-palette';

export interface SplitFlapDigitProps {
  readonly glyph: string;
  readonly width: number;
  readonly height: number;
  readonly color?: string;
  readonly testID?: string;
}

export function SplitFlapDigit({ glyph, width, height, color, testID }: SplitFlapDigitProps) {
  const t = usePremiumTheme();
  const fontSize = height * 0.73;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={glyph}
      style={[styles.tile, { width, height, borderRadius: Math.round(height * 0.13) }]}
    >
      <View style={[styles.half, styles.top]} />
      <View style={[styles.half, styles.bottom]} />
      <Text
        variant="hero"
        color={color ?? t.accent.sun}
        align="center"
        style={{ fontSize, lineHeight: height, letterSpacing: -fontSize * 0.06, fontWeight: '800' }}
      >
        {glyph}
      </Text>
      <View style={styles.seam} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { overflow: 'hidden', justifyContent: 'center' },
  half: { position: 'absolute', left: 0, right: 0, height: '50%' },
  top: { top: 0, backgroundColor: MONETIZE_INK.flapTop },
  bottom: { bottom: 0, backgroundColor: MONETIZE_INK.flapBottom },
  seam: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 2,
    marginTop: -1,
    backgroundColor: MONETIZE_INK.flapSeam,
  },
});
