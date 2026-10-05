/**
 * What the running-late screen needs from the plan when the traveller says she is late for a stop
 * of today: the stop, whether pushing it is hers to do, what the push would move (in the words the
 * stop's sheet uses before a save) or what it runs into, and the two things she can do: push,
 * through the plan editor (which says what changed, with undo), or skip it just for her.
 */
import { toLocalWallTime } from '@cp/domain';
import { useMemo } from 'react';

import { dayItems } from '@/data/plan/plan-model';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useLocale } from '@/lib/i18n/use-locale';

import { travelMinutes } from './fit-check';
import { clock } from './format';
import { retimePreview } from './retime-copy';
import { saidLate } from './said-late';
import { useDayEditing } from './use-day-editing';

export interface SaidLateView {
  readonly loaded: boolean;
  readonly me: string | null;
  readonly guideSlug: string | null;
  /** Null when the stop is not on today's plan (moved, removed, another day). */
  readonly stop: {
    readonly title: string;
    /** The plan item's row id, once it has synced. */
    readonly itemId: string | null;
    readonly place: { readonly lat: number; readonly lng: number } | null;
    /** Its start now, and where the push would put it, as clock text. */
    readonly start: string;
    readonly to: string;
    /** Nobody else goes to this stop. */
    readonly alone: boolean;
    /** Pushing is hers to do and fits the day. */
    readonly canPush: boolean;
    /** "2 later stops move by 30 min" when it can be pushed. */
    readonly moves: string | null;
    /** What the push runs into, when it is hers to make and the day refuses it. */
    readonly blocked: string | null;
  } | null;
  readonly push: () => Promise<unknown>;
  readonly skip: () => Promise<boolean>;
}

export function useSaidLate(tripId: string, stableId: string, minutes: number): SaidLateView {
  const locale = useLocale();
  const plan = useTripPlan(tripId);
  const editor = useDayEditing(plan);
  const tz = plan.trip?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const found = useMemo(() => {
    const row = plan.state.items.find((item) => item.stable_id === stableId);
    const day = plan.state.days.find((candidate) => candidate.day_no === row?.day_no);
    if (row === undefined || day?.date == null) return null;
    const stops = dayItems(plan.state, day.day_no, plan.display, tz);
    const stop = stops.find((item) => item.stableId === stableId);
    return stop === undefined ? null : { stop, stops, slot: { dayNo: day.day_no, date: day.date } };
  }, [plan.state, plan.display, stableId, tz]);
  const base = {
    loaded: plan.loaded,
    me: plan.uid,
    guideSlug: plan.trip?.guide_slug ?? null,
  };
  const none = () => Promise.resolve(false);
  if (found === null || found.stop.start === null) {
    return { ...base, stop: null, push: none, skip: none };
  }
  const { stop, stops, slot } = found;
  const start = found.stop.start;
  if (toLocalWallTime(new Date(), tz).date !== slot.date) {
    return { ...base, stop: null, push: none, skip: none };
  }
  const going = stop.attendeeIds.length === 0 ? plan.members.map((m) => m.uid) : stop.attendeeIds;
  const alone = going.every((uid) => uid === plan.uid);
  const straight = travelMinutes(stops);
  const late = saidLate({
    stops,
    stop,
    minutes,
    slot,
    travel: (from, next) => straight(from.stableId, next.stableId) ?? 0,
    canApply: plan.canApply,
    alone,
  });
  const effect = late === null ? null : retimePreview(late.effect, locale, null);
  return {
    ...base,
    stop: {
      title: stop.title,
      itemId: plan.itemRows.find((row) => row.stable_id === stableId)?.id ?? null,
      place: stop.place,
      start: clock(locale, start),
      to: clock(locale, start + minutes),
      alone,
      canPush: late !== null && late.effect.ok,
      moves: effect?.blocked === false ? effect.line : null,
      blocked: effect?.blocked === true ? effect.line : null,
    },
    push: () => (late === null ? none() : editor.submit(late.ops, { confirmLocked: true })),
    skip: () => editor.skipForMe(stop),
  };
}
