/**
 * The five guides floating around the splash passport (3a-1), each on its own float loop. On the
 * first launch they wait behind the hatch and slap on, one after another, as it fades.
 */
import { useState, type ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { SLAP_STAGGER_MS, useSlap } from '@/motion/patterns/slap';
import { useLoop } from '@/motion/use-loop';
import { guideSticker, type GuideAvatarId } from '@/ui/avatar/guides';
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

export function Floater({
  guide,
  x,
  y,
  bottom,
  size,
  offset,
  waiting = false,
  index = 0,
}: (typeof FLOATERS)[number] & { readonly waiting?: boolean; readonly index?: number }) {
  const float = useLoop('float', { offset });
  const info = guideSticker(guide);
  const vertical: ViewStyle =
    bottom === undefined ? { top: `${(y ?? 0) * 100}%` } : { bottom: `${bottom * 100}%` };
  return (
    <Animated.View
      style={[{ position: 'absolute' }, { left: `${x * 100}%` }, vertical, float]}
      testID={`splash-floater-${guide}`}
    >
      <SlapIn waiting={waiting} index={index}>
        <Sticker kind={info.kind} name={info.name} size={size} />
      </SlapIn>
    </Animated.View>
  );
}

/** Slaps its sticker on when `waiting` clears; renders it plainly if it never waited. */
function SlapIn({
  waiting,
  index,
  children,
}: {
  readonly waiting: boolean;
  readonly index: number;
  readonly children: ReactNode;
}) {
  const [armed] = useState(waiting);
  const slap = useSlap({
    active: armed && !waiting,
    direction: index % 2 === 0 ? 1 : -1,
    delayMs: index * SLAP_STAGGER_MS,
  });
  if (!armed) return children;
  return <Animated.View style={slap}>{children}</Animated.View>;
}

/** Every floater; `waiting` holds them back (hidden) until the launch hatch hands over. */
export function FloaterField({ waiting }: { readonly waiting: boolean }) {
  return FLOATERS.map((floater, index) => (
    <Floater key={floater.guide} {...floater} waiting={waiting} index={index} />
  ));
}
