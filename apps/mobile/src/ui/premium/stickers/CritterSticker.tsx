import type { FormSpec, Pose } from '@cp/critter-art';

import { Sticker } from '@/ui/sticker/Sticker';

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
  /** Bare art without the die-cut edge (silhouettes). @default true */
  readonly edge?: boolean;
  readonly onPress?: () => void;
}

/**
 * A critter in the premium kit: the app's one critter renderer wearing the white sticker edge. The
 * edge and the art never change between light and dark.
 */
export function CritterSticker({ edge = true, ...props }: CritterStickerProps) {
  const t = usePremiumTheme();
  return <Sticker {...props} sticker={edge ? { color: t.accent.stickerEdge } : null} />;
}
