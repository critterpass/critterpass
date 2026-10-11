/**
 * A passport stamp at any size and in any ink (BOOSTED, ADMITTED, FIRST TRIP FREE, BOOST): the
 * triple ring (outer ring, a gap, a hairline) drawn as inset rings, round or rounded-rect, up to
 * three spaced lines around a big word. The kit's `RoundStamp` keeps one size; these pages need
 * 52–270 pt stamps.
 */
import { View } from 'react-native';

import { ring, Text } from '@/ui/premium';

export interface InkStampProps {
  readonly word: string;
  readonly top?: string;
  readonly bottom?: string;
  /** Ring colour; the text colour defaults to it. */
  readonly ink: string;
  readonly text?: string;
  /** Round stamps are `size` across; rect stamps `size` wide. */
  readonly size: number;
  readonly shape?: 'round' | 'rect';
  /** Rect stamps: height. */
  readonly height?: number;
  /** The paper showing through, e.g. `rgba(255,253,246,.7)`. */
  readonly fill?: string;
  readonly rotate?: number;
  /** Big word size. */
  readonly wordSize: number;
  readonly testID?: string;
}

export function InkStamp({
  word,
  top,
  bottom,
  ink,
  text,
  size,
  shape = 'round',
  height,
  fill = 'transparent',
  rotate = 0,
  wordSize,
  testID,
}: InkStampProps) {
  const outer = Math.max(2.5, size * 0.017);
  const lineColour = text ?? ink;
  const small = Math.max(8, Math.round(wordSize * 0.22));
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={[top, word, bottom].filter((s) => s !== undefined).join(' ')}
      style={{
        width: size,
        height: shape === 'round' ? size : (height ?? size * 0.6),
        borderRadius: shape === 'round' ? size / 2 : 18,
        backgroundColor: fill,
        boxShadow: [
          ring(outer, ink, true),
          ring(outer * 2.1, 'transparent', true),
          ring(outer * 2.1 + 1.5, ink, true),
        ].join(', '),
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        transform: [{ rotate: `${String(rotate)}deg` }],
      }}
    >
      {top === undefined ? null : (
        <Text
          variant="label"
          color={lineColour}
          style={{ fontSize: small, fontWeight: '800', letterSpacing: small * 0.2 }}
        >
          {top}
        </Text>
      )}
      <Text
        variant="stat"
        color={lineColour}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontSize: wordSize, lineHeight: wordSize * 1.08, fontWeight: '800' }}
      >
        {word}
      </Text>
      {bottom === undefined ? null : (
        <Text
          variant="label"
          color={lineColour}
          style={{ fontSize: small, fontWeight: '800', letterSpacing: small * 0.16 }}
        >
          {bottom}
        </Text>
      )}
    </View>
  );
}
