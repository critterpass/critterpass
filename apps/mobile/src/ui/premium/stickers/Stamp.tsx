import { View } from 'react-native';

import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export type StampInk = 'pink' | 'green' | 'orange';

export interface RoundStampProps {
  /** The big word or code ("ISSUED", "SIN"), inked in capitals. */
  readonly word: string;
  /** Small spaced lines above and below ("CRITTERPASS", "26 SEP"). */
  readonly top?: string;
  readonly bottom?: string;
  /** @default 'pink' */
  readonly ink?: StampInk;
  /** 96 for an issued stamp, 80 for a port code; the moments go up to 200. @default 96 */
  readonly size?: number;
  /** Degrees. @default −12 */
  readonly rotate?: number;
  /** Stamped on white paper (a landing moment) instead of straight onto the page. */
  readonly paper?: boolean;
  readonly testID?: string;
}

/** Heavy capitals run about 0.62 em wide: the word shrinks to fit inside the ring. */
const CAP_WIDTH_EM = 0.62;

/**
 * The stamp's measures from its size (the design's 84, 122, 170 and 200 stamps): the inked ring,
 * the small spaced lines and the big word, which fits its letters inside the ring.
 */
export function roundStampMeasures(side: number, word: string) {
  const large = side >= 150;
  const ring = large ? Math.round(side * 0.06 * 2) / 2 : side >= 80 ? 8 : 6;
  const small = large ? 10.5 : side >= 110 ? 9 : 8;
  const cap = side * (side < 100 ? 0.29 : 0.215);
  const letters = Math.max(1, Array.from(word).length);
  const fit = (side * 0.8) / (letters * CAP_WIDTH_EM);
  return { ring, small, word: Math.round(Math.min(cap, fit) * 2) / 2 };
}

/**
 * A round passport stamp: a solid inked ring, small spaced capitals around a big word that fits
 * the ring, tilted. Stamps are ink on paper in both modes.
 */
export function RoundStamp({
  word,
  top,
  bottom,
  ink = 'pink',
  size,
  rotate,
  paper = false,
  testID,
}: RoundStampProps) {
  const t = usePremiumTheme();
  const colours = t.stamp[ink];
  const side = size ?? t.size.stampRound;
  const caps = word.toLocaleUpperCase();
  const measures = roundStampMeasures(side, caps);
  const smallStyle = {
    fontSize: measures.small,
    lineHeight: measures.small * 1.25,
    letterSpacing: measures.small * 0.18,
  };
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={[top, word, bottom].filter((s) => s !== undefined).join(' ')}
      style={{
        width: side,
        height: side,
        borderRadius: side / 2,
        borderWidth: measures.ring,
        borderColor: colours.ring,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        ...(paper ? { backgroundColor: t.accent.stickerEdge } : {}),
        transform: [{ rotate: `${String(rotate ?? t.tilt.stampRound)}deg` }],
      }}
    >
      {top === undefined ? null : (
        <Text variant="stampSmall" color={colours.text} style={smallStyle} numberOfLines={1}>
          {top.toLocaleUpperCase()}
        </Text>
      )}
      <Text
        variant="stampWord"
        color={colours.text}
        numberOfLines={1}
        style={{
          fontSize: measures.word,
          lineHeight: measures.word * 1.1,
          letterSpacing: -measures.word * 0.02,
        }}
      >
        {caps}
      </Text>
      {bottom === undefined ? null : (
        <Text variant="stampSmall" color={colours.text} style={smallStyle} numberOfLines={1}>
          {bottom.toLocaleUpperCase()}
        </Text>
      )}
    </View>
  );
}

export interface RectStampProps {
  readonly word: string;
  /** @default 'orange' */
  readonly ink?: StampInk;
  /** Degrees. @default −4 */
  readonly rotate?: number;
  readonly testID?: string;
}

/** A rectangular stamp ("BOOSTED"): 22/800 inside a ring, a white band and a hairline ring. */
export function RectStamp({ word, ink = 'orange', rotate, testID }: RectStampProps) {
  const t = usePremiumTheme();
  const colours = t.stamp[ink];
  const outer = t.size.stampRingOuter;
  const innerAt = t.size.stampRectInnerAt;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={word}
      style={{
        alignSelf: 'flex-start',
        paddingVertical: t.space.gap8,
        paddingHorizontal: t.space.rowPadH,
        borderRadius: t.radius.statusTag,
        borderWidth: outer,
        borderColor: colours.ring,
        transform: [{ rotate: `${String(rotate ?? t.tilt.stampRect)}deg` }],
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          borderRadius: t.radius.statusTag - outer,
          borderWidth: innerAt - outer,
          borderColor: t.accent.stickerEdge,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: innerAt - outer,
          bottom: innerAt - outer,
          left: innerAt - outer,
          right: innerAt - outer,
          borderRadius: t.radius.statusTag - innerAt,
          borderWidth: t.size.stampRingInner,
          borderColor: colours.ring,
        }}
      />
      <Text variant="stampRect" color={colours.text}>
        {word}
      </Text>
    </View>
  );
}
