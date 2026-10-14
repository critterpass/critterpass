/**
 * A locked critter: its silhouette in the premium light mask (gold-tinted for legendaries, the dark
 * gold pair on ink, white at half strength for the one that wandered off), with the tier's "?" over
 * it.
 */
import { PREMIUM_LOCKED_MARK, PREMIUM_STICKER, premiumLockedMask } from '@cp/critter-art';
import type { Rarity } from '@cp/critter-art';
import { StyleSheet, View } from 'react-native';

import { CritterSticker, Text, usePremiumTheme } from '@/ui/premium';

export interface CritterSilhouetteProps {
  readonly kind: string;
  /** Read by assistive tech ("Undiscovered critter"). */
  readonly label: string;
  readonly size: number;
  readonly rarity?: Rarity;
  readonly seed?: number;
  /** Drawn on the ink banner (legendary uses its dark gold). */
  readonly onInk?: boolean;
  /** The one that wandered off: a white ghost at half strength, no "?". */
  readonly ghost?: boolean;
  /** The "?" over the mask. @default true unless ghost */
  readonly mark?: boolean;
  /** "?" colour over the default tier colour (the dark banner's sun "?"). */
  readonly markColor?: string;
  /** Mirror it (the ghost walks away). */
  readonly mirrored?: boolean;
}

export function CritterSilhouette({
  kind,
  label,
  size,
  rarity = 'common',
  seed,
  onInk = false,
  ghost = false,
  mark = !ghost,
  markColor,
  mirrored = false,
}: CritterSilhouetteProps) {
  const th = usePremiumTheme();
  // In the dark the light mask stood out pure white on dark cards: the theme's dark masks instead.
  const mask = ghost
    ? PREMIUM_STICKER.ghostMask
    : th.scheme === 'dark' && !onInk
      ? rarity === 'legendary'
        ? th.color.lockedMaskGold
        : th.color.lockedMask
      : premiumLockedMask(rarity, onInk);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        { width: size, height: size },
        ghost ? { opacity: PREMIUM_STICKER.ghostOpacity } : null,
        mirrored ? { transform: [{ scaleX: -1 }] } : null,
      ]}
    >
      <View
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <CritterSticker
          kind={kind}
          name={label}
          size={size}
          variant="mask"
          maskColor={mask}
          {...(seed === undefined ? {} : { seed })}
        />
      </View>
      {mark ? (
        <View style={[StyleSheet.absoluteFill, styles.mark]} pointerEvents="none">
          <Text
            variant={size < 56 ? 'errorMark' : size < 90 ? 'title' : 'stat'}
            color={markColor ?? PREMIUM_LOCKED_MARK[rarity]}
            accessible={false}
          >
            ?
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center' },
});
