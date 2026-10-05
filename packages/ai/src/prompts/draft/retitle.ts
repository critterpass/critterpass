/**
 * A day whose title no longer matches it is given a new one by the guide, in one short call for
 * all such days: it sees each day's stops as they ended up (part of the day, name, kind) and
 * writes a title for what the day holds. A title that still does not fit, or a failed call,
 * leaves the day to `withFittingTitles`, which names it after its two main stops: the last resort.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import { foodRole, minuteOfDate } from '@cp/planner';

import { spanOf } from './areas';

import { isDeclined, textOf } from '../../structured';
import { languageLine, personaSystem, placeNames, type DraftModel } from './context';
import type { DraftPlanInput } from './context';
import { titleFits } from './day-titles';
import { withoutHedge } from './hedge';
import { proseProblem } from './schema';
import { shownName } from './shown-names';

const TITLE_MAX = 40;

const TASK = [
  '# Task',
  '',
  'Write a title (under 40 characters) for each day below, in your voice, for what the day holds',
  'now. A title says what the day is like: never two place names joined by "and".',
  '- Name a kind of place (a market, a waterfall, a café) only when the day has one, and in the',
  '  plural only when it has two; say "morning", "early" or "evening" only for what is then.',
  '- Never mention a flight, a bus, a train or an airport: you do not know how the crew travels.',
  '- A day built around a place that takes half the day or the whole day is named for it',
  '  ("A morning at Datanla", "Bà Nà Hills, the whole day").',
  '- Words only: no numbers, dates, times, prices, digits, emoji or links.',
  'Reply with one line per day and nothing else, as "<day number>: <title>".',
].join('\n');

type Planned = Pick<
  DraftPlanInput,
  'pois' | 'frame' | 'locale' | 'destinationLanguages' | 'guide' | 'pools' | 'travel'
>;

function partOfDay(minute: number): string {
  return minute < 12 * 60 ? 'morning' : minute < 17 * 60 + 30 ? 'afternoon' : 'evening';
}

function dayLines(input: Planned, day: DraftDay): string[] {
  const stops = day.items.flatMap((item) => {
    const poi = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
    if (poi === undefined) return [];
    const at = minuteOfDate(new Date(item.starts_at), day.date, input.frame.tz);
    const kind =
      item.kind === 'meal' ? 'meal' : foodRole(poi) === 'light' ? 'café or snack' : poi.category;
    const span = item.kind === 'meal' ? null : spanOf(input, poi);
    const long = span === null ? '' : span === 'full' ? ', the whole day' : ', half the day';
    return [`- ${partOfDay(at)}: ${shownName(input, poi)} (${kind}${long})`];
  });
  return [`Day ${day.day_no}, titled "${day.theme}" before it changed:`, ...stops];
}

/**
 * The itinerary with a new title on every day whose title does not fit, where the guide wrote one
 * that fits.
 */
export async function retitleDays(
  model: DraftModel,
  input: Planned & { readonly destination: string },
  itinerary: Itinerary,
  options: {
    /** Days whose title must change whatever it says. */
    readonly also?: readonly number[];
    /** The only days that may be retitled (default: every day). */
    readonly only?: readonly number[];
  } = {},
): Promise<{ readonly itinerary: Itinerary; readonly retitled: number }> {
  const stale = itinerary.days.filter(
    (day) =>
      day.items.length > 0 &&
      (options.only === undefined || options.only.includes(day.day_no)) &&
      (options.also?.includes(day.day_no) === true || !titleFits(input, day)),
  );
  if (stale.length === 0) return { itinerary, retitled: 0 };
  const titles = new Map<number, string>();
  try {
    const result = await model.call(
      'draft.summary',
      {
        system: personaSystem(input.guide, TASK),
        messages: [
          {
            role: 'user',
            content: [
              `Destination: ${input.destination}`,
              ...languageLine(input.locale),
              '',
              ...stale.flatMap((day) => [...dayLines(input, day), '']),
            ].join('\n'),
          },
        ],
        temperature: 0.7,
      },
      'titles',
    );
    if (isDeclined(result.message)) return { itinerary, retitled: 0 };
    for (const line of textOf(result.message).split('\n')) {
      const found = /^\D*(\d+)\s*[:.-]\s*(.+)$/u.exec(line.trim());
      if (found?.[1] === undefined || found[2] === undefined) continue;
      const title = withoutHedge(found[2].trim().replace(/^["“'](.*)["”']$/u, '$1'), input.guide);
      titles.set(Number(found[1]), title);
    }
  } catch {
    return { itinerary, retitled: 0 };
  }
  const names = placeNames(input);
  let retitled = 0;
  const days = itinerary.days.map((day) => {
    const theme = titles.get(day.day_no);
    if (theme === undefined || theme === day.theme || !stale.includes(day)) return day;
    if (theme.length > TITLE_MAX + 20 || proseProblem(theme, 60, names) !== null) return day;
    const next = { ...day, theme };
    if (!titleFits(input, next)) return day;
    retitled += 1;
    return next;
  });
  return { itinerary: { ...itinerary, days }, retitled };
}
