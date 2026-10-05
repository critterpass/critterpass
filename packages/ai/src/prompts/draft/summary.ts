/**
 * The guide's one line under a finished draft ("Temples early, markets late, and the bamboo before
 * the crowds."), on the fast tier. It sees the day themes and whether every must-do made it, never
 * a number; a line with a digit or a link, a decline or a failed call falls back to a plain line.
 * When we know too few places in the destination to fill the days, the line says so instead of
 * passing a near-empty plan off as a draft.
 */
import { isDeclined, textOf } from '../../structured';
import type { Itinerary } from '@cp/domain';
import { minuteOfDate } from '@cp/planner';

import { spanOf } from './areas';

import { languageLine, personaSystem, type DraftModel, type DraftPlanInput } from './context';
import { shownName } from './shown-names';
import { withoutHedge } from './hedge';
import type { PersonaId } from '../../persona/schema';
import { proseProblem } from './schema';

export const SUMMARY_MAX = 160;

export interface SummaryInput {
  readonly guide: PersonaId;
  readonly destination: string;
  readonly themes: readonly string[];
  readonly allMustDos: boolean;
  /** Place names the line may use as they are (digits included). */
  readonly names?: readonly string[];
  /** The language the organiser reads (BCP 47); absent, English. */
  readonly locale?: string;
  /** We know too few places here to fill the days: the line must say so. */
  readonly thin?: boolean;
  /** Days built around one long visit, the longest first ("day 3: Bà Nà Hills, the whole day"). */
  readonly longVisits?: readonly string[];
}

/** The draft's days built around one long visit, as the summary's facts name them. */
export function longVisitsOf(
  input: Pick<
    DraftPlanInput,
    'pois' | 'frame' | 'locale' | 'destinationLanguages' | 'pools' | 'travel'
  >,
  itinerary: Itinerary,
): string[] {
  const found = itinerary.days.flatMap((day) => {
    const long = day.items
      .flatMap((item) => {
        const poi = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
        const span = poi === undefined || item.kind === 'meal' ? null : spanOf(input, poi);
        return poi === undefined || span === null ? [] : [{ poi, span, at: item.starts_at }];
      })
      .sort((a, b) => b.poi.durationMin - a.poi.durationMin)[0];
    if (long === undefined) return [];
    const start = minuteOfDate(new Date(long.at), day.date, input.frame.tz);
    const part =
      long.span === 'full' ? 'the whole day' : start < 13 * 60 ? 'the morning' : 'the afternoon';
    const line = `day ${day.day_no}: ${shownName(input, long.poi)}, ${part}`;
    return [{ line, minutes: long.poi.durationMin }];
  });
  // The longest first: the line has room for one.
  return found.sort((a, b) => b.minutes - a.minutes).map((entry) => entry.line);
}

const TASK = [
  '# Task',
  '',
  'Write one line (under 140 characters) that sums up the trip draft below, in your voice, for the',
  'organiser who will review it. When the facts give a day built around one place, the line says',
  'so in passing (a whole day at it, a morning there); never name one the facts do not give.',
  'Words only: no numbers, dates, times, prices, digits, emoji or links.',
  'Reply with the line and nothing else.',
].join('\n');

const THIN_TASK = [
  '# Task',
  '',
  'The trip draft below is sparse because we know only a few places in this destination so far.',
  'Write one line (under 140 characters), in your voice, that tells the organiser exactly that,',
  'plainly and without apology, and that they can add places from search for you to fit in.',
  'Words only: no numbers, dates, times, prices, digits, emoji or links.',
  'Reply with the line and nothing else.',
].join('\n');

export function templateSummary(input: SummaryInput): string {
  if (input.locale?.toLowerCase().startsWith('vi') === true) {
    if (input.thin === true) {
      return `Tôi mới biết vài điểm ở ${input.destination}, nên bản nháp này còn mỏng. Bạn thêm điểm từ tìm kiếm, tôi sẽ xếp vào.`;
    }
    return input.allMustDos
      ? `Mọi điểm phải đi đều có trong bản nháp ${input.destination} của bạn.`
      : `Đây là bản nháp ${input.destination} của bạn. Hãy sửa những gì cần trước khi cả nhóm xem.`;
  }
  if (input.thin === true) {
    return `I only know a few places in ${input.destination} so far, so this draft is thin. Add places from search and I will fit them in.`;
  }
  return input.allMustDos
    ? `Every must-do made it into your ${input.destination} draft.`
    : `Here is your ${input.destination} draft. Fix anything before the crew sees it.`;
}

export async function writeDraftSummary(model: DraftModel, input: SummaryInput): Promise<string> {
  const facts = [
    `Destination: ${input.destination}`,
    `Day themes, in order: ${input.themes.join('; ')}`,
    input.allMustDos ? 'Every must-do made it.' : 'Some must-dos did not fit.',
    ...(input.longVisits?.[0] === undefined
      ? []
      : [`A day built around one place: ${input.longVisits[0]}.`]),
    ...languageLine(input.locale),
    ...(input.thin === true
      ? ['We know only a few places here: most of each day is still open.']
      : []),
  ].join('\n');
  const system = personaSystem(input.guide, input.thin === true ? THIN_TASK : TASK);
  const ask = async (content: string, key: string): Promise<string | null> => {
    const result = await model.call(
      'draft.summary',
      { system, messages: [{ role: 'user', content }], temperature: 0.7 },
      key,
    );
    if (isDeclined(result.message)) return null;
    return withoutHedge(
      textOf(result.message)
        .trim()
        .replace(/^["“'](.*)["”']$/u, '$1'),
      input.guide,
    );
  };
  try {
    let line = await ask(facts, 'summary');
    // A line too long for the review screen is asked for once more, shorter.
    if (line !== null && line.length > SUMMARY_MAX && !line.includes('\n')) {
      line = await ask(
        `${facts}\n\nYour line was ${line.length} characters: "${line}". Write it again, under 140 characters.`,
        'summary-shorter',
      );
    }
    if (line === null || line.length === 0 || line.length > SUMMARY_MAX || line.includes('\n')) {
      return templateSummary(input);
    }
    return proseProblem(line, SUMMARY_MAX, input.names ?? []) === null
      ? line
      : templateSummary(input);
  } catch {
    return templateSummary(input);
  }
}
