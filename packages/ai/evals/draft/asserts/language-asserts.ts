/**
 * What an organiser who does not read English is shown: no English sentence in a first draft's
 * day titles, notes or summary, nor in a redraft's title, summary or notes. And the essential
 * places of a destination: all in the draft, or each left out for a reason a rule gives.
 */
import type { Itinerary } from '@cp/domain';

import type { DraftPlanInput } from '../../../src/prompts/draft/context';
import { essentialsOf, visitTakingIn } from '../../../src/prompts/draft/essentials';
import type { DraftPlanResult } from '../../../src/prompts/draft/pipeline';
import type { RedraftOutcome } from '../../../src/prompts/draft/redraft';

const ENGLISH = new Set(
  'the and with for of to is in your you this that at on it a an are we our from by'.split(' '),
);

/** Whether a line reads as an English sentence: several English function words, no Vietnamese letters. */
export function looksEnglish(text: string): boolean {
  // ă â đ ê ô ơ ư and every toned vowel: letters English never uses.
  if (/[\u0103\u00e2\u0111\u00ea\u00f4\u01a1\u01b0\u1ea0-\u1ef9]/iu.test(text.normalize('NFC')))
    return false;
  const words = text.toLowerCase().split(/[^a-z]+/u);
  return words.filter((word) => ENGLISH.has(word)).length >= 3;
}

/** A redraft read in another language has no English sentence in its title, summary or notes. */
export function gradeLanguage(locale: string | undefined, outcome: RedraftOutcome): string[] {
  if (locale === undefined || locale.toLowerCase().startsWith('en')) return [];
  const read = [
    ['title', outcome.title],
    ['summary', outcome.summary],
    ...outcome.day.items.map((item) => ['a note', item.note] as const),
  ] as const;
  return read.flatMap(([what, text]) =>
    text !== null && looksEnglish(text)
      ? [`language: ${what} is in English: "${text.slice(0, 60)}"`]
      : [],
  );
}

/** A first draft read in another language has no English sentence in its titles, notes or summary. */
export function gradeDraftLanguage(
  locale: string | undefined,
  itinerary: Itinerary,
  summary: string,
): string[] {
  if (locale === undefined || locale.toLowerCase().startsWith('en')) return [];
  const read: (readonly [string, string | null])[] = [
    ['the summary', summary],
    ...itinerary.days.flatMap((day): (readonly [string, string | null])[] => [
      [`day ${day.day_no}'s title`, day.theme],
      ...day.items.map((item): readonly [string, string | null] => [
        `a note on day ${day.day_no}`,
        item.note,
      ]),
    ]),
  ];
  return read.flatMap(([what, text]) =>
    text !== null && looksEnglish(text)
      ? [`language: ${what} is in English: "${text.slice(0, 60)}"`]
      : [],
  );
}

/**
 * Every essential place is in the draft, or the planner's findings say why not; and on a trip of
 * four days or more none is left out merely for want of room.
 */
export function gradeEssentials(input: DraftPlanInput, result: DraftPlanResult): string[] {
  const held = new Set(result.itinerary.days.flatMap((d) => d.items.map((i) => i.poi_id)));
  const why = new Map(result.essentialsLeftOut.map((gap) => [gap.poiId, gap.reason]));
  return essentialsOf(input).flatMap((poi) => {
    if (held.has(poi.id) || visitTakingIn(input, result.itinerary, poi) !== null) return [];
    const reason = why.get(poi.id);
    if (reason === undefined) return [`essential: ${poi.name} is missing and nothing says why`];
    return reason === 'no_room' && result.itinerary.days.length >= 4
      ? [`essential: ${poi.name} left out for want of room`]
      : [];
  });
}
