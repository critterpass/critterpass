/**
 * A soft edge where the plan map sheet's scrolling body meets something pinned over it (the day
 * chips above, the add bar below): the body fades into the sheet's own fill instead of ending in a
 * hard line or showing a card's edge past the bar. It never takes touches.
 */
import { StyleSheet, View } from 'react-native';

import { usePremiumTheme } from '@/ui/premium';

/* eslint-disable lingui/no-unlocalized-strings -- CSS gradient parts, never copy. */
/** A colour at zero alpha, so the fade runs from the fill's own hue, not from black. */
function clearOf(colour: string): string {
  return /^#[0-9a-f]{6}$/i.test(colour) ? `${colour}00` : 'transparent';
}

export interface EdgeFadeProps {
  /** The pinned piece's side: the fade is solid there and clears towards the content. */
  readonly edge: 'top' | 'bottom';
  readonly height: number;
  /** How far in (0 to 1) the fade stays solid before it clears, for a bar that floats over it. */
  readonly solid?: number;
  /** Where the fade sits from its edge. */
  readonly offset?: number;
}

export function EdgeFade({ edge, height, solid = 0, offset = 0 }: EdgeFadeProps) {
  const th = usePremiumTheme();
  const fill = th.material.sheet.fill;
  const direction = edge === 'top' ? '180deg' : '0deg';
  const stop = `${String(Math.round(solid * 100))}%`;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.fade,
        edge === 'top' ? { top: offset } : { bottom: offset },
        {
          height,
          experimental_backgroundImage: `linear-gradient(${direction}, ${fill} ${stop}, ${clearOf(fill)})`,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0 },
});
