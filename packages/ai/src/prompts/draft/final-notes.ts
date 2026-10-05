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

import { hopCap, insideVisit } from './areas';
import type { DraftPlanInput } from './context';
import { withFittingTitles } from './day-titles';
import { essentialsOf } from './essentials';
import { shownName } from './shown-names';

/** A stretch this long with nothing planned is said to be free. */
const FREE_HOURS_MIN = 120;

/** The planner's own lines, in the languages a draft is read in. */
export interface PlannerLines {
  readonly longRide: string;
  readonly freeTime: string;
  /** The same stretch on a day she asked to be slower or lighter. */
  readonly freeAsAsked: string;
  /** The same stretch on a redrafted day: free, without claiming nothing could fill it. */
  readonly freeLeft: string;
  /** On a long visit that takes in an essential place of its own. */
  readonly takesIn: (name: string) => string;
  /** Lines a redraft adds to its summary. */
  readonly redraft: {
    readonly moved: (names: string) => string;
    readonly leftOut: (name: string) => string;
    readonly walksKept: string;
  };
  /** On a stop left in the open air on a day redrafted for rain. */
  readonly outdoors: string;
  readonly noMeal: { readonly lunch: string; readonly dinner: string };
  readonly arrival: string;
  readonly departure: string;
}

const EN: PlannerLines = {
  longRide: "Getting here is the day's long ride.",
  freeTime: 'Nothing we know nearby fits the hours after this: they are yours.',
  freeAsAsked: 'The hours after this are left free, as you asked for a slower day.',
  freeLeft: 'The hours after this are free: time to rest, or to wander nearby.',
  takesIn: (name) => `${name} is part of this visit.`,
  redraft: {
    moved: (names) => `Moved to other days: ${names}.`,
    leftOut: (name) => `${name} is off the trip for now: no other day has room for it.`,
    walksKept: 'I could not cut the walking: these stops are a short stroll apart as they are.',
  },
  outdoors: 'This one is in the open air and nothing indoors is near: take a raincoat.',
  noMeal: {
    lunch: 'No place we know nearby for lunch: eat where you like.',
    dinner: 'No place we know nearby for dinner: eat where you like.',
  },
  arrival: ASSUMED_ARRIVAL_NOTE,
  departure: ASSUMED_DEPARTURE_NOTE,
};

const VI: PlannerLines = {
  longRide: 'Đây là chặng đi dài nhất trong ngày.',
  outdoors: 'Điểm này ở ngoài trời và quanh đây chưa có chỗ nào trong nhà: nhớ mang áo mưa.',
  freeTime: 'Quanh đây chưa có điểm nào vừa với mấy tiếng sau chặng này: khoảng đó là của bạn.',
  freeAsAsked: 'Mấy tiếng sau chặng này để trống, đúng như bạn muốn một ngày chậm hơn.',
  freeLeft: 'Mấy tiếng sau chặng này là thời gian tự do: nghỉ ngơi hoặc dạo quanh đây.',
  takesIn: (name) => `${name} nằm trong chuyến tham quan này.`,
  redraft: {
    moved: (names) => `Chuyển sang ngày khác: ${names}.`,
    leftOut: (name) => `${name} tạm rời chuyến đi: chưa ngày nào khác còn chỗ.`,
    walksKept: 'Mình chưa bớt được phần đi bộ: các điểm này vốn đã sát nhau.',
  },
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

function withRideAndMealNotes(
  input: DraftPlanInput,
  day: DraftDay,
  dayIndex: number,
  freeKind: 'none' | 'asked' | 'left',
): DraftDay {
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
    // An essential inside this long visit, not a stop of its own, is named on it.
    const anchor = input.pois.get(item.poi_id ?? '');
    if (anchor === undefined) return;
    for (const inside of essentialsOf(input)) {
      if (insideVisit(input, inside, anchor) && !day.items.some((i) => i.poi_id === inside.id)) {
        say(index, words.takesIn(shownName(input, inside)));
      }
    }
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
    if (free < FREE_HOURS_MIN) return;
    say(
      index,
      freeKind === 'asked'
        ? words.freeAsAsked
        : freeKind === 'left'
          ? words.freeLeft
          : words.freeTime,
    );
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
  options: {
    readonly retitle: boolean;
    /**
     * The day a redraft made: its free hours are free because she asked for a slower or lighter
     * day (`slower`), else simply free; never "nothing fits".
     */
    readonly redrafted?: { readonly dayNo: number; readonly slower: boolean };
  } = { retitle: true },
): { readonly itinerary: Itinerary; readonly removed: number; readonly retitled: number } {
  const honest = withHonestNotes(itinerary, input.pois, input.frame.tz);
  const dateIndex = new Map(input.frame.dates.map((date, index) => [date, index]));
  const noted = {
    ...honest.itinerary,
    days: honest.itinerary.days.map((day) =>
      withRideAndMealNotes(
        input,
        day,
        dateIndex.get(day.date) ?? day.day_no - 1,
        options.redrafted?.dayNo !== day.day_no
          ? 'none'
          : options.redrafted.slower
            ? 'asked'
            : 'left',
      ),
    ),
  };
  const assumed = withAssumedTravelNotes(noted, input.frame, plannerLines(input.locale));
  const titled = options.retitle
    ? withFittingTitles(input, assumed)
    : { itinerary: assumed, retitled: 0 };
  return { itinerary: titled.itinerary, removed: honest.removed, retitled: titled.retitled };
}
