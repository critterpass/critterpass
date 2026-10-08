/**
 * Reordering a day's stops by hand (7b-1): long-press lifts a stop (a booked or pinned one
 * refuses with its reason), crossing other stops previews the new order (the mini-map redraws it),
 * and the drop times the day again and sends it through the plan editor: an organiser's applies,
 * a member's becomes a change set for the crew. An impossible order comes back with the reason
 * instead and nothing is sent; cancelling drops the preview.
 */
/* eslint-disable lingui/no-unlocalized-strings -- refusal and outcome kinds, never copy. */
import type { PlanOp } from '@cp/domain';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { DayItem } from '@/data/plan/plan-model';
import type { DaySlot } from '@/data/plan/plan-ops';
import type { EditOutcome } from '@/data/plan/use-plan-editor';

import { isPinned, moveInOrder, reschedule, type Refusal, type Travel } from './reschedule';

export type LiftResult = { readonly ok: true } | { readonly ok: false; readonly refusal: Refusal };

export type DropOutcome =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'refused'; readonly refusal: Refusal }
  | { readonly kind: 'sent'; readonly outcome: EditOutcome };

/**
 * What the timeline does with the lifted stop: it stays in its new place only when the plan took
 * the order (an organiser's edit, applied or queued). A member's suggestion leaves the plan as it
 * was, so the stop goes back to where the plan has it, as does an order that was refused or could
 * not be sent.
 */
export function dropResult(dropped: DropOutcome): 'moved' | 'sent' | 'back' {
  if (dropped.kind !== 'sent') return 'back';
  if (dropped.outcome.kind === 'applied') return 'moved';
  return dropped.outcome.kind === 'proposed' ? 'sent' : 'back';
}

export interface ReorderInput {
  /** The day's stops in their order. */
  readonly stops: readonly DayItem[];
  readonly slot: DaySlot;
  readonly travel: Travel;
  readonly submit: (ops: readonly PlanOp[]) => Promise<EditOutcome>;
  /** Read-only plans (a past trip, a draft) don't lift. */
  readonly editable: boolean;
}

export interface Reorder {
  /** The order the drag would leave, while a stop is lifted. */
  readonly preview: readonly string[] | null;
  readonly lifted: number | null;
  readonly lift: (index: number) => LiftResult;
  readonly cross: (index: number) => void;
  readonly drop: () => Promise<DropOutcome>;
  readonly cancel: () => void;
}

export function useReorder(input: ReorderInput): Reorder {
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  // The drop reads the latest drag even when it fires in the same tick as the last cross.
  const current = useRef<{ from: number; over: number } | null>(null);
  const latest = useRef(input);
  useLayoutEffect(() => {
    latest.current = input;
  });
  const ids = useMemo(() => input.stops.map((stop) => stop.stableId), [input.stops]);

  const set = useCallback((next: { from: number; over: number } | null) => {
    current.current = next;
    setDrag(next);
  }, []);

  const lift = useCallback(
    (index: number): LiftResult => {
      const stop = latest.current.stops[index];
      if (!latest.current.editable) return { ok: false, refusal: { kind: 'read_only' } };
      if (stop === undefined) return { ok: false, refusal: { kind: 'read_only' } };
      if (isPinned(stop)) return { ok: false, refusal: { kind: 'pinned', stop } };
      if (stop.start === null) return { ok: false, refusal: { kind: 'untimed', stop } };
      set({ from: index, over: index });
      return { ok: true };
    },
    [set],
  );

  const cross = useCallback(
    (index: number) => {
      const now = current.current;
      if (now === null || now.over === index) return;
      set({ from: now.from, over: index });
    },
    [set],
  );

  const cancel = useCallback(() => set(null), [set]);

  const drop = useCallback(async (): Promise<DropOutcome> => {
    const now = current.current;
    set(null);
    if (now === null || now.from === now.over) return { kind: 'unchanged' };
    const { stops, slot, travel, submit } = latest.current;
    const order = moveInOrder(
      stops.map((stop) => stop.stableId),
      now.from,
      now.over,
    );
    const timed = reschedule(stops, order, slot, travel);
    if (!timed.ok) return { kind: 'refused', refusal: timed.refusal };
    if (timed.ops.length === 0) return { kind: 'unchanged' };
    return { kind: 'sent', outcome: await submit(timed.ops) };
  }, [set]);

  const preview = useMemo(
    () => (drag === null ? null : moveInOrder(ids, drag.from, drag.over)),
    [drag, ids],
  );
  return { preview, lifted: drag?.from ?? null, lift, cross, drop, cancel };
}
