import { useEffect, useState } from 'react';

import { useDraw } from '@/motion/patterns/draw';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { Sticker } from '../sticker/Sticker';
import type { StickerProps } from '../sticker/Sticker';
import { useBlink } from './use-blink';

/** docs/design-system.md §3.1 `draw`: 1500 ms for creatures, 700 ms for icons. */
const DRAW_MS = { creature: 1500, icon: 700 } as const;

export interface LiveStickerProps extends Omit<
  StickerProps,
  'drawProgress' | 'closedEyes' | 'delay'
> {
  /** Draw on when mounted (heroes); `false` shows the finished sticker straight away. @default true */
  readonly drawOn?: boolean;
  /** Wait before requesting a draw-on slot, to stagger several heroes. @default 0 */
  readonly delay?: number;
  /** `icon` doodles draw faster than `creature` stickers. @default 'creature' */
  readonly drawKind?: 'creature' | 'icon';
  /** Creatures blink; set `false` for objects and scenery. @default true */
  readonly blinks?: boolean;
  /** Off-screen stickers stop blinking. @default true */
  readonly visible?: boolean;
  /** Tap replays the draw-on. @default true when `drawOn` */
  readonly replayOnPress?: boolean;
}

/**
 * The motion-wired sticker: draws itself on through the app's ≤ 2-concurrent draw gate (a third
 * waits its turn, drawn blank until then), then rests on the cached static frame and blinks on the
 * idle schedule. Reduce Motion shows the finished sticker at once and never blinks.
 */
export function LiveSticker({
  drawOn = true,
  delay = 0,
  drawKind = 'creature',
  blinks = true,
  visible = true,
  replayOnPress,
  onPress,
  ...stickerProps
}: LiveStickerProps) {
  const reduced = useReducedImpactMotion();
  const wantsDraw = drawOn && !reduced;
  const [phase, setPhase] = useState<'waiting' | 'drawing' | 'done'>(
    wantsDraw ? 'waiting' : 'done',
  );
  const [round, setRound] = useState(0);
  const { progress, isDrawing } = useDraw({
    active: phase === 'drawing' && !reduced,
    kind: drawKind,
  });

  // Delay, then request a slot: `useDraw` holds the slot while `phase` is `drawing`.
  useEffect(() => {
    if (phase !== 'waiting') return;
    const timer = setTimeout(() => setPhase('drawing'), delay);
    return () => clearTimeout(timer);
  }, [phase, delay, round]);

  // Once granted, the stroke-trim runs for the draw duration; then the slot is released.
  useEffect(() => {
    if (phase !== 'drawing' || !isDrawing) return;
    const timer = setTimeout(() => setPhase('done'), DRAW_MS[drawKind]);
    return () => clearTimeout(timer);
  }, [phase, isDrawing, drawKind]);

  // Reduce Motion (possibly resolved after mount) ends any draw-on and releases its slot.
  const done = phase === 'done' || reduced;
  const closedEyes = useBlink({ visible, enabled: blinks && done });
  const replays = replayOnPress ?? drawOn;
  const press = () => {
    onPress?.();
    if (!replays || reduced) return;
    // eslint-disable-next-line react-hooks/immutability -- a Reanimated shared value's `.value` setter, not React state.
    progress.value = 0;
    setRound((value) => value + 1);
    setPhase('waiting');
  };

  return (
    <Sticker
      {...stickerProps}
      closedEyes={closedEyes}
      {...(done ? {} : { drawProgress: progress })}
      {...(onPress || (replays && !reduced) ? { onPress: press } : {})}
    />
  );
}
