import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMotionMode } from '@/motion/motion-mode';

import { Text, type TextVariant } from '../text/Text';
import { makeStyles } from '../theme';

export interface GlyphDropProps {
  readonly text: string;
  readonly variant?: TextVariant;
  readonly color?: string;
  /** Draw a caret after the last glyph (the field is being typed into). */
  readonly caret?: boolean;
  readonly caretColor?: string;
  readonly testID?: string;
}

/** 120–180 ms per glyph (3a-2): later glyphs in a burst land a touch slower, so fast typing reads. */
function dropMs(index: number): number {
  return 120 + (index % 4) * 20;
}

function graphemes(text: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter === undefined) return Array.from(text);
  return Array.from(
    new Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
    (s) => s.segment,
  );
}

function Glyph({
  glyph,
  index,
  variant,
  color,
  animate,
}: {
  readonly glyph: string;
  readonly index: number;
  readonly variant: TextVariant;
  readonly color: string | undefined;
  readonly animate: boolean;
}) {
  const progress = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate) progress.value = withTiming(1, { duration: dropMs(index) });
    // Mount-only: each glyph drops once, when it is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 30 }],
  }));
  return (
    <Animated.View style={style}>
      <Text variant={variant} color={color}>
        {glyph}
      </Text>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'nowrap', overflow: 'hidden' },
  caret: { width: 2, height: 20, marginStart: 1, marginBottom: 3, borderRadius: 1 },
  caretDefault: { backgroundColor: t.color.pink },
}));

/**
 * Text where each newly typed glyph drops onto the page (fall 30 pt, fade in). Glyphs already on
 * the page stay put while later ones arrive. Reduced motion: glyphs appear in place. Read as one
 * string by screen readers.
 */
export function GlyphDrop({
  text,
  variant = 'title',
  color,
  caret = false,
  caretColor,
  testID,
}: GlyphDropProps) {
  const styles = useStyles();
  const [mode] = useMotionMode();
  const animate = mode === 'full';
  const glyphs = graphemes(text);
  return (
    <View style={styles.row} accessible accessibilityLabel={text} testID={testID}>
      {glyphs.map((glyph, index) => (
        // Index + glyph keys: editing mid-word re-drops only the glyphs from the edit onward.
        <Glyph
          key={`${index}:${glyph}`}
          glyph={glyph}
          index={index}
          variant={variant}
          color={color}
          animate={animate}
        />
      ))}
      {caret ? (
        <View
          style={[styles.caret, caretColor ? { backgroundColor: caretColor } : styles.caretDefault]}
        />
      ) : null}
    </View>
  );
}
