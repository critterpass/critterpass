/**
 * 3a-1 → 3a-2: OPEN YOUR PASS swings the cover open like a real passport and the first page fills
 * the screen. One choreography, every step on the UI thread:
 *
 *   0 ms     the bob eases to rest, the cover lifts (−12°), the guides and footer fade out
 *   260 ms   the cover swings open on its spine to edge-on (−90°), baring the paper page under it
 *   560 ms   the page grows from the cover's frame into the pass card's place on the name page
 *   1020 ms  the name page cross-fades in over it (the stack's fade), card on card
 *
 * The stage stays opened while the name page is up, and closes again only when the splash is
 * focused again, so it never snaps back in view.
 */
import { useEffect } from 'react';
import {
  Easing,
  cancelAnimation,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '@/motion/easing';

const standard = bezierEasing(tokens.motion.easing.standard);
const exit = bezierEasing(tokens.motion.easing.exit);

export const COVER_W = 240;
export const COVER_H = 320;

export const OPENING_MS = {
  lift: 260,
  swing: 420,
  /** The page starts growing while the cover's last quarter turn is still going. */
  growDelay: 560,
  grow: tokens.motion.duration.medium,
} as const;

/** When the name page takes over: the page has reached the card's place. */
export const OPENING_TOTAL_MS = OPENING_MS.growDelay + OPENING_MS.grow;

/**
 * Where 3a-2's pass card sits in the page body (below the safe area): the "PAGE 1 OF 4" row
 * (8 pt padding + a 16 pt eyebrow line) and the 12 pt content inset, 20 pt side margins, and the
 * card's printed proportions (350 × 248 in the 3a-2 render).
 */
export const NAME_CARD = { top: 36, side: 20, aspect: 248 / 350 } as const;

export interface Frame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The cover's frame inside the page body when the stage (centred flex box) has `stage`. */
export function coverFrame(stage: Frame): Frame {
  return {
    x: stage.x + (stage.width - COVER_W) / 2,
    y: stage.y + (stage.height - COVER_H) / 2,
    width: COVER_W,
    height: COVER_H,
  };
}

/**
 * The name page's card frame in the stage's parent, `bodyWidth` wide, whose content starts
 * `bodyTop` down (the safe-area padding the stage sits under).
 */
export function nameCardFrame(bodyWidth: number, bodyTop: number): Frame {
  const width = bodyWidth - NAME_CARD.side * 2;
  return {
    x: NAME_CARD.side,
    y: bodyTop + NAME_CARD.top,
    width,
    height: width * NAME_CARD.aspect,
  };
}

export interface PassportOpening {
  /** The cover's rotation about its spine, degrees (0 closed, −90 edge-on). */
  readonly swing: SharedValue<number>;
  /** 0 → 1: the bob's loop eases to rest. */
  readonly settle: SharedValue<number>;
  /** 1 → 0: guides, Tokek and the footer. */
  readonly chrome: SharedValue<number>;
  /** 0 → 1: the page travels from the cover's frame to the card's. */
  readonly grow: SharedValue<number>;
  readonly start: (onDone: () => void) => void;
  readonly reset: () => void;
}

export function usePassportOpening(focused: boolean): PassportOpening {
  const swing = useSharedValue(0);
  const settle = useSharedValue(0);
  const chrome = useSharedValue(1);
  const grow = useSharedValue(0);

  /* eslint-disable react-hooks/immutability -- Reanimated shared values' `.value` setters (not React
     state), written only from effects and press handlers, never during render (the same false
     positive ui/sheet/use-modal-presentation.ts documents). */
  const reset = () => {
    for (const value of [swing, settle, grow]) {
      cancelAnimation(value);
      value.value = 0;
    }
    cancelAnimation(chrome);
    chrome.value = 1;
  };

  // Back on the splash (the name page popped): closed again, before the page fades back in.
  useEffect(() => {
    if (focused) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable
  }, [focused]);

  const start = (onDone: () => void) => {
    settle.value = withTiming(1, { duration: OPENING_MS.lift, easing: standard });
    chrome.value = withTiming(0, { duration: OPENING_MS.lift, easing: exit });
    swing.value = withSequence(
      withTiming(-12, { duration: OPENING_MS.lift, easing: Easing.out(Easing.quad) }),
      withTiming(-90, { duration: OPENING_MS.swing, easing: Easing.in(Easing.quad) }),
    );
    grow.value = withDelay(
      OPENING_MS.growDelay,
      withTiming(1, { duration: OPENING_MS.grow, easing: standard }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(onDone);
      }),
    );
  };

  /* eslint-enable react-hooks/immutability */

  return { swing, settle, chrome, grow, start, reset };
}
