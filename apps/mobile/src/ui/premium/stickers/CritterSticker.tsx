import type { FormSpec, Pose } from '@cp/critter-art';

import { Sticker } from '@/ui/premium/stickers/art/Sticker';

import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface CritterStickerProps {
  readonly kind: string;
  /** The critter's name, read by assistive tech. */
  readonly name: string;
  readonly size: number;
  readonly pose?: Pose;
  readonly form?: FormSpec;
  readonly seed?: number;
  readonly closedEyes?: boolean;
  /**
   * The white die-cut edge. The premium design leaves it off small critters in avatars, notes and
   * docks and off one-colour doodles; those pass `false`. @default true, false for a mask
   */
  readonly edge?: boolean;
  /** `mask` draws the locked silhouette in one colour. */
  readonly variant?: 'mask';
  /** The silhouette colour. @default the theme's grey locked mask */
  readonly maskColor?: string;
  readonly onPress?: () => void;
}

/**
 * A critter in the premium kit: the app's one critter renderer wearing the white sticker edge. The
 * edge and the art never change between light and dark; a locked silhouette takes the mode's mask.
 */
export function CritterSticker({ edge, variant, maskColor, ...props }: CritterStickerProps) {
  const t = usePremiumTheme();
  const masked = variant === 'mask';
  const withEdge = edge ?? !masked;
  return (
    <Sticker
      {...props}
      {...(masked ? { variant: 'mask' as const, maskColor: maskColor ?? t.color.lockedMask } : {})}
      sticker={withEdge ? { color: t.accent.stickerEdge } : null}
      bareByDesign={!withEdge}
    />
  );
}
