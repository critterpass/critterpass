/**
 * The finishing touches every stage shares, once the stops are settled. Notes that name a time
 * their stop is not at come off; the first and last stop say what was assumed about arriving and
 * leaving; the stop at the end of the day's one long ride says so; a day that runs through lunch
 * or dinner with no place we know to serve it says that too, instead of skipping the meal
 * silently; a long stretch nothing nearby could fill is said to be free; and a day title that no longer matches the day is written again from its stops.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import {
  DINNER,
  DINNER_LAST_START_MIN,
  LUNCH,
  LUNCH_LAST_START_MIN,
  dayWindow,
  mealAt,
  mealsInWindow,
  minuteOfDate,
  ASSUMED_ARRIVAL_NOTE,
  ASSUMED_DEPARTURE_NOTE,
  withAssumedTravelNotes,
  withHonestNotes,
  withNoteLine,
} from '@cp/planner';

import { hopCap } from './areas';
import type { DraftPlanInput } from './context';
import { withFittingTitles } from './day-titles';

/** A stretch this long with nothing planned is said to be free. */
const FREE_HOURS_MIN = 180;

/** The planner's own lines, in the languages a draft is read in. */
export interface PlannerLines {
  readonly longRide: string;
  readonly freeTime: string;
  readonly noMeal: { readonly lunch: string; readonly dinner: string };
  readonly arrival: string;
  readonly departure: string;
}

const EN: PlannerLines = {
  longRide: "Getting here is the day's long ride.",
  freeTime: 'Nothing we know nearby fits the hours after this: they are yours.',
  noMeal: {
    lunch: 'No place we know nearby for lunch: eat where you like.',
    dinner: 'No place we know nearby for dinner: eat where you like.',
  },
  arrival: ASSUMED_ARRIVAL_NOTE,
  departure: ASSUMED_DEPARTURE_NOTE,
};

const VI: PlannerLines = {
  longRide: 'Đây là chặng đi dài nhất trong ngày.',
  freeTime: 'Quanh đây chưa có điểm nào vừa với mấy tiếng sau chặng này: khoảng đó là của bạn.',
  noMeal: {
    lunch: 'Chúng tôi chưa biết quán nào gần đây cho bữa trưa: bạn cứ ăn ở đâu tùy thích.',
    dinner: 'Chúng tôi chưa biết quán nào gần đây cho bữa tối: bạn cứ ăn ở đâu tùy thích.',
  },
  arrival:
    'Tôi tạm tính bạn đến nơi khoảng giữa trưa. Thêm chuyến bay hoặc chuyến xe rồi nhờ tôi làm lại ngày này.',
  departure:
    'Tôi tạm tính bạn rời đi vào cuối buổi chiều. Thêm chuyến bay hoặc chuyến xe rồi nhờ tôi làm lại ngày này.',
};

/** The planner's lines for a reader's language (English unless we have that language). */
export function plannerLines(locale: string | undefined): PlannerLines {
  return locale?.toLowerCase().startsWith('vi') === true ? VI : EN;
}

export const LONG_RIDE_NOTE = EN.longRide;
export const FREE_TIME_NOTE = EN.freeTime;
export const NO_MEAL_NOTE = EN.noMeal;

function withRideAndMealNotes(input: DraftPlanInput, day: DraftDay, dayIndex: number): DraftDay {
  if (day.items.length === 0) return day;
  const { tz } = input.frame;
  const cap = hopCap(input);
  const words = plannerLines(input.locale);
  const at = (iso: string) => minuteOfDate(new Date(iso), day.date, tz);
  const lines = new Map<number, string[]>();
  const say = (index: number, line: string) =>
    lines.set(index, [...(lines.get(index) ?? []), line]);
  day.items.forEach((item, index) => {
    if (index > 0 && item.travel_min > cap) say(index, words.longRide);
  });
  const had = new Set(
    day.items.flatMap((item) => (item.kind === 'meal' ? [mealAt(at(item.starts_at))] : [])),
  );
  const spans = {
    lunch: [LUNCH.startMin, LUNCH_LAST_START_MIN],
    dinner: [DINNER.startMin, DINNER_LAST_START_MIN],
  } as const;
  for (const slot of mealsInWindow(dayWindow(input.frame, dayIndex))) {
    const [from, to] = spans[slot];
    const through = day.items.some(
      (item) => at(item.starts_at) <= from && at(item.ends_at) >= to + 30,
    );
    if (had.has(slot) || through) continue;
    // On the last stop before the meal would have been.
    const before = day.items.map((item) => at(item.starts_at)).filter((start) => start <= to);
    say(Math.max(0, before.length - 1), words.noMeal[slot]);
  }
  // Hours before dinner that nothing we know nearby could fill are said to be free.
  const full = dayIndex > 0 && dayIndex < input.frame.dates.length - 1;
  day.items.forEach((item, index) => {
    const next = day.items[index + 1];
    if (!full || next === undefined || at(next.starts_at) > DINNER_LAST_START_MIN) return;
    const free = at(next.starts_at) - at(item.ends_at) - next.travel_min;
    if (free >= FREE_HOURS_MIN) say(index, words.freeTime);
  });
  if (lines.size === 0) return day;
  return {
    ...day,
    items: day.items.map((item, index) =>
      (lines.get(index) ?? []).reduce(
        (kept, line) => ({ ...kept, note: withNoteLine(kept.note, line) }),
        item,
      ),
    ),
  };
}

export function withFinalNotes(
  input: DraftPlanInput,
  itinerary: Itinerary,
): { readonly itinerary: Itinerary; readonly removed: number; readonly retitled: number } {
  const honest = withHonestNotes(itinerary, input.pois, input.frame.tz);
  const dateIndex = new Map(input.frame.dates.map((date, index) => [date, index]));
  const noted = {
    ...honest.itinerary,
    days: honest.itinerary.days.map((day) =>
      withRideAndMealNotes(input, day, dateIndex.get(day.date) ?? day.day_no - 1),
    ),
  };
  const titled = withFittingTitles(
    input,
    withAssumedTravelNotes(noted, input.frame, plannerLines(input.locale)),
  );
  return { itinerary: titled.itinerary, removed: honest.removed, retitled: titled.retitled };
}
