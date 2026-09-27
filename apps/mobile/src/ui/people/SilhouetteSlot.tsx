import Animated from 'react-native-reanimated';

import { useLoop } from '@/motion/use-loop';

import { SilhouetteSlot as StickerSilhouette } from '../sticker/SilhouetteSlot';
import type { SilhouetteSlotProps as StickerSilhouetteProps } from '../sticker/SilhouetteSlot';
import { useTheme } from '../theme';

export interface SilhouetteSlotProps extends Omit<
  StickerSilhouetteProps,
  'maskColor' | 'glyphColor'
> {
  /** Legendary locals lock as a gold silhouette with a yellow "?". */
  readonly legendary?: boolean;
  /** Off-screen slots rest. @default true */
  readonly visible?: boolean;
}

/** The locked dex slot, breathing on the shared idle clock in the grey or gold locked colours. */
export function SilhouetteSlot({
  legendary = false,
  visible = true,
  ...rest
}: SilhouetteSlotProps) {
  const theme = useTheme();
  const breathe = useLoop('pulse', { active: visible });
  const maskColor = legendary ? theme.tier.locked.legendary.silhouette : theme.tier.locked.default;
  const glyphColor = legendary ? theme.tier.legendary.color : theme.tier.common.color;
  return (
    <Animated.View style={breathe}>
      <StickerSilhouette {...rest} maskColor={maskColor} glyphColor={glyphColor} />
    </Animated.View>
  );
}
