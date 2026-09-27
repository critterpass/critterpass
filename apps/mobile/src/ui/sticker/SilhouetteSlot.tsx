import type { SkiaEngine } from '@cp/critter-art/skia';
import { StyleSheet, Text, View } from 'react-native';

import { lockedStickerLabel } from './a11y';
import type { StickerCache } from './cache';
import { Sticker } from './Sticker';

export interface SilhouetteSlotProps {
  readonly kind: string;
  /** The critter's home city, for the locked a11y label ("Undiscovered local, found by being in {city}"). */
  readonly city: string;
  readonly size: number;
  /** The mask recolour — grey (undiscovered) or gold (discovered elsewhere but not here), per the design's two silhouette states. */
  readonly maskColor: string;
  /** The tier colour the "?" glyph renders in. */
  readonly glyphColor: string;
  readonly seed?: number;
  /** Forwarded to the inner `<Sticker>` — see its own doc comment. */
  readonly engine?: SkiaEngine;
  readonly cache?: StickerCache;
}

/** The locked CritterDex slot: a mask-variant silhouette with a "?" glyph in tier colour over it. */
export function SilhouetteSlot(props: SilhouetteSlotProps): React.JSX.Element {
  const { kind, city, size, maskColor, glyphColor, seed, engine, cache } = props;
  const label = lockedStickerLabel(city);

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <View
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Sticker
          kind={kind}
          name={city}
          size={size}
          variant="mask"
          maskColor={maskColor}
          {...(seed !== undefined ? { seed } : {})}
          {...(engine !== undefined ? { engine } : {})}
          {...(cache !== undefined ? { cache } : {})}
        />
      </View>
      {/* Decorative — the outer View's own `accessible`/`accessibilityLabel` already collapses this and the hidden sticker into one read-through node, so this "?" needs no accessibility props of its own. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Text
          allowFontScaling={false}
          style={[styles.glyph, { color: glyphColor, fontSize: size * 0.4, lineHeight: size }]}
        >
          ?
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: {
    textAlign: 'center',
    fontWeight: '700',
  },
});
