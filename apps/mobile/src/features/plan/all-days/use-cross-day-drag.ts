/**
 * Holding a stop on one day's card and dropping it on another (7b-3): which card is under the
 * finger, what a drop means (nothing on its own day or off the cards; a booked or pinned stop
 * refuses to leave its day), and the move itself: the stop keeps its local time on the new day,
 * that day is timed again around it, and both days are read again for the preview before anything
 * is sent.
 */
import type { PlanOp } from '@cp/domain';
import { useCallback, useRef, useState } from 'react';

import type { DayItem } from '@/data/plan/plan-model';
import { moveToDayOp } from '@/data/plan/plan-ops';

import { isPinned, reschedule, type Refusal, type Travel } from '../day-plan/reschedule';
import { estimatedRoute } from '../trip-map/day-route';
import { roadMinutes } from '../trip-map/format';
import type { TripDay } from '../trip-map/trip-days';

export interface CardRect {
  readonly dayNo: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The day whose card holds the point (window coordinates), or null between and off the cards. */
export function dayAt(rects: Iterable<CardRect>, x: number, y: number): number | null {
  for (const rect of rects) {
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
      return rect.dayNo;
    }
  }
  return null;
}

export type CrossDayDrop =
  | { readonly kind: 'none' }
  | { readonly kind: 'refused'; readonly refusal: Refusal }
  | { readonly kind: 'move'; readonly stop: DayItem; readonly from: number; readonly to: number };

/** What letting go of `stop` (from day `from`) over day `to` means. */
export function dropOutcome(stop: DayItem, from: number, to: number | null): CrossDayDrop {
  if (to === null || to === from) return { kind: 'none' };
  if (isPinned(stop)) return { kind: 'refused', refusal: { kind: 'pinned', stop } };
  return { kind: 'move', stop, from, to };
}

export interface DayAfter {
  readonly day: TripDay;
  readonly before: { readonly stops: readonly DayItem[]; readonly roadMinutes: number };
  readonly after: { readonly stops: readonly DayItem[]; readonly roadMinutes: number };
}

export type MovePlan =
  | {
      readonly ok: true;
      readonly ops: readonly PlanOp[];
      readonly from: DayAfter;
      readonly to: DayAfter;
    }
  | { readonly ok: false; readonly refusal: Refusal };

const road = (day: TripDay, stops: readonly DayItem[]) =>
  roadMinutes(estimatedRoute({ ...day, stops }).legs).minutes;

/** The move of `stop` onto `to`, with `to` timed again around it, and both days before and after. */
export function planMove(stop: DayItem, from: TripDay, to: TripDay, travel: Travel): MovePlan {
  if (isPinned(stop)) return { ok: false, refusal: { kind: 'pinned', stop } };
  if (to.date === null) return { ok: false, refusal: { kind: 'untimed', stop } };
  const slot = { dayNo: to.dayNo, date: to.date };
  const arriving: DayItem = { ...stop, dayNo: to.dayNo };
  const joined = [...to.stops, arriving];
  const order = [...joined]
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || a.stableId.localeCompare(b.stableId))
    .map((item) => item.stableId);
  const timed = reschedule(joined, order, slot, travel);
  if (!timed.ok) return { ok: false, refusal: timed.refusal };
  const start = timed.starts.get(stop.stableId) ?? stop.start;
  const length = stop.start === null || stop.end === null ? 60 : stop.end - stop.start;
  const moved = moveToDayOp({ ...stop, start, end: start === null ? null : start + length }, slot);
  const others = timed.ops.filter((op) => op.op === 'reorder_days' || op.item !== stop.stableId);
  const afterTo = order.flatMap((id) => joined.filter((item) => item.stableId === id));
  const afterFrom = from.stops.filter((item) => item.stableId !== stop.stableId);
  return {
    ok: true,
    ops: [moved, ...others],
    from: {
      day: from,
      before: { stops: from.stops, roadMinutes: road(from, from.stops) },
      after: { stops: afterFrom, roadMinutes: road(from, afterFrom) },
    },
    to: {
      day: to,
      before: { stops: to.stops, roadMinutes: road(to, to.stops) },
      after: { stops: afterTo, roadMinutes: road(to, afterTo) },
    },
  };
}

export interface CrossDayDrag {
  /** The stop held and its day, while a drag runs. */
  readonly held: { readonly stop: DayItem; readonly from: number } | null;
  /** The card under the finger. */
  readonly over: number | null;
  readonly setRect: (rect: CardRect) => void;
  readonly start: (stop: DayItem, from: number) => void;
  readonly move: (x: number, y: number) => void;
  readonly end: (x: number, y: number) => CrossDayDrop;
  readonly cancel: () => void;
}

export function useCrossDayDrag(): CrossDayDrag {
  const rects = useRef(new Map<number, CardRect>());
  const heldRef = useRef<{ stop: DayItem; from: number } | null>(null);
  const [held, setHeld] = useState<{ stop: DayItem; from: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const setRect = useCallback((rect: CardRect) => {
    rects.current.set(rect.dayNo, rect);
  }, []);
  const start = useCallback((stop: DayItem, from: number) => {
    heldRef.current = { stop, from };
    setHeld({ stop, from });
    setOver(from);
  }, []);
  const move = useCallback((x: number, y: number) => {
    setOver(dayAt(rects.current.values(), x, y));
  }, []);
  const cancel = useCallback(() => {
    heldRef.current = null;
    setHeld(null);
    setOver(null);
  }, []);
  const end = useCallback(
    (x: number, y: number): CrossDayDrop => {
      const now = heldRef.current;
      cancel();
      if (now === null) return { kind: 'none' };
      return dropOutcome(now.stop, now.from, dayAt(rects.current.values(), x, y));
    },
    [cancel],
  );
  return { held, over, setRect, start, move, end, cancel };
}
