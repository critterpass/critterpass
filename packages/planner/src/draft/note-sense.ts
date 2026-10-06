/**
 * The guide writes its line about a stop before the planner times it, so a line can name a meal or
 * a time of day the stop did not get ("for dinner" on a stop at four, "after dark" before sunset).
 * Once the day is timed, a line that names a time the stop is not at is taken off: no line reads
 * better than a wrong one. And where the planner assumed when the crew arrives or leaves (no
 * flight or bus known yet), the first and last stop say so, so the organiser knows why the day is
 * the length it is and how to change it.
 */
import type { DraftDay, Itinerary } from '@cp/domain';

import { nameTokens } from './place-names';
import { sunsetMin } from './time-of-day';
import { minuteOfDate } from './schedule-day';
import type { DraftPoi, TripFrame } from './types';

type Fits = (startMin: number, sunset: number) => boolean;

/** Words a line may use only when the stop starts in their part of the day. */
const TIME_WORDS: readonly (readonly [readonly string[], Fits])[] = [
  [['breakfast'], (start) => start < 10 * 60 + 30],
  [['morning'], (start) => start < 12 * 60],
  [['lunch', 'lunchtime', 'midday', 'noon'], (start) => start >= 11 * 60 && start <= 14 * 60 + 30],
  [['afternoon'], (start) => start >= 12 * 60 && start < 18 * 60],
  [['dinner', 'supper'], (start) => start >= 17 * 60 + 30],
  [['sunset', 'dusk'], (start, sunset) => start >= sunset - 120 && start <= sunset + 15],
  [['evening'], (start) => start >= 16 * 60 + 30],
  [
    ['night', 'nightcap', 'tonight', 'midnight', 'nightfall'],
    (start, sunset) => start >= sunset + 15,
  ],
];
const NIGHT = TIME_WORDS[TIME_WORDS.length - 1]?.[1] as Fits;

/** "Before dinner" and "until lunch" say when the stop is not. */
const RELATIVE = new Set(['before', 'until', 'till', 'pre']);
/** "After lunch" and "after dinner" say the stop is later than that meal. */
const AFTER = new Set(['after', 'post', 'sau']);
const AFTER_MEAL: Readonly<Record<string, number>> = { lunch: 12 * 60, dinner: 18 * 60 + 30 };

/** Vietnamese names of meals and times of day, as word pairs (accents folded), in English. */
const VI_PAIRS: Readonly<Record<string, string>> = {
  'bua sang': 'breakfast',
  'an sang': 'breakfast',
  'buoi sang': 'morning',
  'bua trua': 'lunch',
  'an trua': 'lunch',
  'buoi trua': 'lunch',
  'buoi chieu': 'afternoon',
  'bua toi': 'dinner',
  'an toi': 'dinner',
  'buoi toi': 'evening',
  'hoang hon': 'sunset',
  'ban dem': 'night',
  've dem': 'night',
};

/** The tokens of a line with each Vietnamese pair read as the one English word it means. */
function timeTokens(note: string): string[] {
  const raw = nameTokens(note);
  const out: string[] = [];
  for (let at = 0; at < raw.length; at += 1) {
    const pair = VI_PAIRS[`${raw[at] ?? ''} ${raw[at + 1] ?? ''}`];
    if (pair === undefined) out.push(raw[at] as string);
    else {
      out.push(pair);
      at += 1;
    }
  }
  return out;
}

/** Whether a line names a meal or a time of day that a stop starting at `startMin` is not at. */
export function noteNamesAnotherTime(note: string, startMin: number, sunset: number): boolean {
  const tokens = timeTokens(note);
  return tokens.some((token, index) => {
    const previous = tokens[index - 1] ?? '';
    // "After dark" is the night itself; "after lunch" on a stop at ten is not true.
    if (token === 'dark') return previous === 'after' && !NIGHT(startMin, sunset);
    if (AFTER.has(previous)) {
      const from = AFTER_MEAL[token];
      return from !== undefined && startMin < from;
    }
    if (RELATIVE.has(previous) || previous === 'truoc') return false;
    const rule = TIME_WORDS.find(([words]) => words.includes(token));
    return rule !== undefined && !rule[1](startMin, sunset);
  });
}

export interface HonestNotes {
  readonly itinerary: Itinerary;
  /** Lines taken off because they named a time the stop is not at. */
  readonly removed: number;
}

export function withHonestNotes(
  itinerary: Itinerary,
  pois: ReadonlyMap<string, DraftPoi>,
  tz: string,
): HonestNotes {
  let removed = 0;
  const days = itinerary.days.map((day) => ({
    ...day,
    items: day.items.map((item) => {
      const poi = item.poi_id === null ? undefined : pois.get(item.poi_id);
      if (item.note === null || poi === undefined) return item;
      const start = minuteOfDate(new Date(item.starts_at), day.date, tz);
      if (!noteNamesAnotherTime(item.note, start, sunsetMin(poi, day.date))) return item;
      removed += 1;
      return { ...item, note: null };
    }),
  }));
  return { itinerary: { ...itinerary, days }, removed };
}

export const ASSUMED_ARRIVAL_NOTE =
  'I assumed you land around midday. Add your flight or bus and ask me to redo this day.';
export const ASSUMED_DEPARTURE_NOTE =
  'I assumed you leave in the late afternoon. Add your flight or bus and ask me to redo this day.';

/** A stop's line is at most this long (what the prose check allows a note). */
const NOTE_MAX = 200;

/** `note` with `line` after it (once); the line alone when both would run too long. */
export function withNoteLine(note: string | null, line: string): string {
  if (note === null || note.includes(line)) return line;
  const joined = `${note} ${line}`;
  return joined.length <= NOTE_MAX ? joined : line;
}

/**
 * Says what the planner assumed where no arrival or departure is known: on the first stop of the
 * first day and the last stop of the last day (a one-stop trip says the departure only).
 */
export function withAssumedTravelNotes(
  itinerary: Itinerary,
  frame: TripFrame,
  lines: { readonly arrival: string; readonly departure: string } = {
    arrival: ASSUMED_ARRIVAL_NOTE,
    departure: ASSUMED_DEPARTURE_NOTE,
  },
): Itinerary {
  const first = frame.dates[0];
  const last = frame.dates[frame.dates.length - 1];
  const mark = (day: DraftDay): DraftDay => {
    const at = { arrival: -1, departure: -1 };
    if (frame.arrivalMin === null && day.date === first) at.arrival = 0;
    if (frame.departureMin === null && day.date === last) at.departure = day.items.length - 1;
    if (at.arrival === at.departure) at.arrival = -1;
    if (at.arrival < 0 && at.departure < 0) return day;
    return {
      ...day,
      items: day.items.map((item, index) =>
        index === at.arrival
          ? { ...item, note: withNoteLine(item.note, lines.arrival) }
          : index === at.departure
            ? { ...item, note: withNoteLine(item.note, lines.departure) }
            : item,
      ),
    };
  };
  return { ...itinerary, days: itinerary.days.map(mark) };
}
