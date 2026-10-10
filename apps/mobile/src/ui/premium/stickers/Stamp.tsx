import { View } from 'react-native';

import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export type StampInk = 'pink' | 'green' | 'orange';

export interface RoundStampProps {
  /** The big word or code ("ISSUED", "SIN"). */
  readonly word: string;
  /** Small spaced lines above and below ("CRITTERPASS", "26 SEP"). */
  readonly top?: string;
  readonly bottom?: string;
  /** @default 'pink' */
  readonly ink?: StampInk;
  /** 96 for an issued stamp, 80 for a port code. @default 96 */
  readonly size?: number;
  /** Degrees. @default −12 */
  readonly rotate?: number;
  readonly testID?: string;
}

/**
 * A round passport stamp: an outer ring and a hairline inner ring, 8/800 spaced lines around a
 * 20/800 word (18/800 for a lone code), tilted. Stamps are ink on paper in both modes.
 */
export function RoundStamp({
  word,
  top,
  bottom,
  ink = 'pink',
  size,
  rotate,
  testID,
}: RoundStampProps) {
  const t = usePremiumTheme();
  const colours = t.stamp[ink];
  const side = size ?? t.size.stampRound;
  const small = side < t.size.stampRound;
  const innerAt = small ? t.size.stampInnerAtSmall : t.size.stampInnerAt;
  const lone = top === undefined && bottom === undefined;
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
        borderWidth: small ? t.size.stampRingOuterSmall : t.size.stampRingOuter,
        borderColor: colours.ring,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: `${String(rotate ?? t.tilt.stampRound)}deg` }],
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: side - innerAt * 2,
          height: side - innerAt * 2,
          borderRadius: side / 2 - innerAt,
          borderWidth: t.size.stampRingInner,
          borderColor: colours.ring,
        }}
      />
      {top === undefined ? null : (
        <Text variant="stampSmall" color={colours.text}>
          {top}
        </Text>
      )}
      <Text variant={lone ? 'stampCode' : 'stampWord'} color={colours.text}>
        {word}
      </Text>
      {bottom === undefined ? null : (
        <Text variant="stampSmall" color={colours.text}>
          {bottom}
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
