/**
 * What the organiser's reason chips ask of a redrafted day, in words for the guide and in the
 * planner's own terms: "slower" and "lighter" take activities off and keep lunch and dinner, "less
 * travel" keeps the stops in one part of the map, and a later start opens the day's window later,
 * so the planner times the day from there whatever the guide answers.
 */
import type { DraftDay, RedraftReasonKey } from '@cp/domain';
import { dayWindow, type TripFrame } from '@cp/planner';

import { clockText } from './context';

export const REASON_TEXT: Readonly<Record<RedraftReasonKey, string>> = {
  slower: 'slower: fewer activities and more time at each, meals kept',
  cheaper: 'cheaper: free and lower-priced places',
  less_train: 'less travel: stops close together, no long rides',
  more_food: 'more food: markets, snacks and a proper meal',
  swap_it_out: 'swap it out: mostly different places',
  surprise_me: 'surprise me: something the crew would not expect',
  later_start: 'later start: a slow morning, nothing early',
  lighter_day: 'lighter day: less packed in, with time left free, meals kept',
  less_travel: 'less travel: stops close together, no long rides',
};

/** The frame a redraft plans in: the day opens later when the organiser asked for a later start. */
export function frameFor(
  frame: TripFrame,
  dayNo: number,
  reasons: readonly RedraftReasonKey[],
): TripFrame {
  if (!reasons.includes('later_start') || frame.laterStartDays?.includes(dayNo) === true) {
    return frame;
  }
  return { ...frame, laterStartDays: [...(frame.laterStartDays ?? []), dayNo] };
}

export interface ReasonContext {
  readonly day: DraftDay;
  /** The frame the day is replanned in (see `frameFor`). */
  readonly frame: TripFrame;
  /** The longest ride between two stops the planner allows on a day. */
  readonly hopCapMin: number;
}

/** What each reason asks of the new day, measured against the day as it stands. */
export function reasonTarget(reason: RedraftReasonKey, context: ReasonContext): string {
  const { day } = context;
  const activities = day.items.filter((item) => item.kind === 'activity').length;
  const food = day.items.filter((item) => item.kind === 'meal').length;
  const fewer = `at most ${Math.max(1, activities - 1)} activities (the day has ${activities} now)`;
  const meals = 'Lunch and dinner stay: a day with fewer stops still eats.';
  switch (reason) {
    case 'slower':
      return `Slower means ${fewer}. ${meals}`;
    case 'cheaper':
      return 'Cheaper means swapping at least one priced stop for a free or lower-priced one.';
    case 'less_train':
    case 'less_travel':
      return `Less travel means every stop in the same area or the one next to it, and no ride between two stops over ${context.hopCapMin} minutes: drop or swap the stop furthest from the rest, and pick meal places beside the activities.`;
    case 'more_food':
      return `More food means more than ${food} food stops: add a market or a meal place.`;
    case 'swap_it_out':
      return 'Swap it out means most stops not marked KEEP become different places.';
    case 'surprise_me':
      return 'Surprise me means at least one place of a kind this day does not have yet.';
    case 'later_start': {
      const window = dayWindow(context.frame, day.day_no - 1);
      return `Later start means the day now begins at ${clockText(window.startMin)}: no breakfast stop and nothing that is best early in the morning, unless it is marked KEEP.`;
    }
    case 'lighter_day':
      return `Lighter day means ${fewer}, dropping the most tiring one. ${meals}`;
  }
}
