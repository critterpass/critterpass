/** The five guides floating around the splash passport (3a-1), each on its own float loop. */
import type { ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLoop } from '@/motion/use-loop';
import { GUIDE_STICKERS, type GuideAvatarId } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';

/**
 * Where the five floating guides sit around the passport, as fractions of the stage: `y` places a
 * guide's top edge, `bottom` its bottom edge (Paco stands just under the passport and must never
 * reach down into the tagline, whatever the stage height).
 */
export const FLOATERS: readonly {
  guide: GuideAvatarId;
  x: number;
  y?: number;
  bottom?: number;
  size: number;
  offset: number;
}[] = [
  { guide: 'pon', x: 0.02, y: 0.06, size: 76, offset: 0 },
  { guide: 'lundi', x: 0.78, y: 0.1, size: 70, offset: 0.2 },
  { guide: 'ajo', x: 0.0, y: 0.6, size: 80, offset: 0.4 },
  { guide: 'sardi', x: 0.8, y: 0.6, size: 64, offset: 0.6 },
  { guide: 'paco', x: 0.42, bottom: 0.01, size: 76, offset: 0.8 },
];

export function Floater({ guide, x, y, bottom, size, offset }: (typeof FLOATERS)[number]) {
  const float = useLoop('float', { offset });
  const info = GUIDE_STICKERS[guide];
  const vertical: ViewStyle =
    bottom === undefined ? { top: `${(y ?? 0) * 100}%` } : { bottom: `${bottom * 100}%` };
  return (
    <Animated.View
      style={[{ position: 'absolute' }, { left: `${x * 100}%` }, vertical, float]}
      testID={`splash-floater-${guide}`}
    >
      <Sticker kind={info.kind} name={info.name} size={size} />
    </Animated.View>
  );
}
