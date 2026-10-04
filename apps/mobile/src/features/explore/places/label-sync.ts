/**
 * The picked place's label and the carousel move together (7c-2): tapping a dot picks it (the
 * label pops over it and the carousel orders nearest first from it); swiping the carousel moves
 * the label to the card it settles on, while the order stays the one the tap set, so the cards
 * never reshuffle under a finger. A tap on the map away from any place lets go of both.
 */
import { estimateStraightLineEta } from '@cp/domain';
import { useCallback, useMemo, useState } from 'react';

import type { Point } from '../map-model';

export interface LabelState {
  /** The place the carousel is ordered from (the last dot tapped). */
  readonly anchorId: string | null;
  /** The place the label sits on: the anchor, or the card the carousel settled on. */
  readonly focusedId: string | null;
}

export const NO_PICK: LabelState = { anchorId: null, focusedId: null };

export function pickPlace(id: string): LabelState {
  return { anchorId: id, focusedId: id };
}

export function settleCard(state: LabelState, id: string): LabelState {
  return state.anchorId === null ? pickPlace(id) : { ...state, focusedId: id };
}

/** "NEXT DOOR": a place at most this many minutes on from the one before it. */
export const NEXT_DOOR_MIN = 10;

/** About how many minutes by road between two places (a straight line, as the map has no router). */
export function minutesBetween(a: Point, b: Point): number {
  return Math.max(
    1,
    Math.round(
      estimateStraightLineEta({
        originLat: a.lat,
        originLng: a.lng,
        destLat: b.lat,
        destLng: b.lng,
        mode: 'auto',
      }).minutes,
    ),
  );
}

export function useLabelSync(initialId: string | null = null) {
  const [state, setState] = useState<LabelState>(
    initialId === null ? NO_PICK : pickPlace(initialId),
  );
  const pick = useCallback((id: string) => setState(pickPlace(id)), []);
  const settle = useCallback((id: string) => setState((now) => settleCard(now, id)), []);
  const clear = useCallback(() => setState(NO_PICK), []);
  return useMemo(() => ({ ...state, pick, settle, clear }), [state, pick, settle, clear]);
}
