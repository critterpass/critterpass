/**
 * Code-side checks on a `places.compromise` reply: two different candidates from the list; titles
 * and bodies within length, one line, no emoji, links or markup; every number or time in an
 * option's words one that candidate holds (the recap's number guard); and every capitalised word
 * after a sentence's first one a word the input carries (a name, a place, a day), so the guide
 * cannot bring in a person or a place of its own. Anything else is rejected, never repaired.
 */
import { allowedNumbersIn, ungroundedRecapNumbers } from '../recap/number-guard';
import { foldText } from '../search-parse/validate';
import {
  COMPROMISE_BODY_MAX,
  COMPROMISE_TITLE_MAX,
  placeCompromiseReplySchema,
  type CompromiseCandidate,
  type CompromiseOption,
  type PlaceCompromiseInput,
  type PlaceCompromiseResult,
} from './schema';

const LINK = /https?:\/\/|www\./iu;
const EMOJI = /\p{Extended_Pictographic}/u;
const MARKUP = /[<>{}[\]`#*|]|untrusted/iu;

/**
 * Words either language may capitalise that name no one: day names (code-written day labels
 * abbreviate them) and the Vietnamese nouns that open a place's name (Bảo tàng, Chùa, Bãi biển).
 */
const COMMON_WORDS =
  'monday tuesday wednesday thursday friday saturday sunday mon tue wed thu fri sat sun thu bay nhat chu hai ba tu nam sau bao tang chua den bai bien cho cung dien thac nui';

const wordsOf = (text: string): string[] => foldText(text).match(/\p{L}+/gu) ?? [];

/** Every word the input lets the guide capitalise: names, places, days, facts. */
function allowedWords(input: PlaceCompromiseInput): Set<string> {
  const sources = [
    input.placeName,
    input.guide,
    COMMON_WORDS,
    ...input.stances.map((stance) => stance.name),
    ...input.silent,
    ...input.candidates.flatMap((c) => [
      c.placeName,
      c.day,
      c.cost ?? '',
      ...c.attendees,
      ...c.facts,
    ]),
  ];
  return new Set(sources.flatMap(wordsOf));
}

/** Capitalised words that are not the first of a sentence and that the input never carries. */
export function unknownProperWords(text: string, allowed: ReadonlySet<string>): string[] {
  const unknown: string[] = [];
  for (const sentence of text.split(/(?<=[.!?:;])\s+/u)) {
    const tokens = sentence.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
    tokens.slice(1).forEach((token) => {
      if (token.length < 2 || token[0] === token[0]?.toLowerCase()) return;
      // An all-caps title is a style, not a name: only mixed-case words are checked there.
      if (token === token.toUpperCase()) return;
      if (wordsOf(token).some((word) => !allowed.has(word))) unknown.push(token);
    });
  }
  return unknown;
}

function lineProblem(text: string, max: number): string | null {
  if (text.length === 0 || text.length > max) return 'length';
  if (/\n/u.test(text) || LINK.test(text) || EMOJI.test(text) || MARKUP.test(text)) return 'format';
  return null;
}

const clean = (text: string): string => text.trim().replace(/[ \t]+/gu, ' ');

/** Checks one parsed reply against the candidates and stances it was written from. */
export function checkPlaceCompromiseReply(
  raw: unknown,
  input: PlaceCompromiseInput,
): PlaceCompromiseResult {
  const fallback = (reason: string): PlaceCompromiseResult => ({
    ok: false,
    reason,
    fallbackIds: input.candidates.slice(0, 2).map((candidate) => candidate.id),
  });
  const parsed = placeCompromiseReplySchema.safeParse(raw);
  if (!parsed.success) return fallback('shape');
  const [first, second] = parsed.data.options;
  if (first === undefined || second === undefined) return fallback('shape');
  if (first.candidate_id === second.candidate_id) return fallback('same_candidate');
  const allowed = allowedWords(input);
  const options: CompromiseOption[] = [];
  for (const option of [first, second]) {
    const candidate = input.candidates.find((c) => c.id === option.candidate_id);
    if (candidate === undefined) return fallback('unknown_candidate');
    const title = clean(option.title);
    const body = clean(option.body);
    const problem =
      lineProblem(title, COMPROMISE_TITLE_MAX) ?? lineProblem(body, COMPROMISE_BODY_MAX);
    if (problem !== null) return fallback(problem);
    const numbers = allowedNumbersIn(candidateFacts(candidate));
    if (ungroundedRecapNumbers(`${title} ${body}`, numbers).length > 0) {
      return fallback('ungrounded_number');
    }
    if (unknownProperWords(`${title}. ${body}`, allowed).length > 0) {
      return fallback('unknown_name');
    }
    options.push({ candidateId: candidate.id, title, body });
  }
  const [a, b] = options;
  return a === undefined || b === undefined ? fallback('shape') : { ok: true, options: [a, b] };
}

/** What one candidate vouches for: its times, counts, day, cost and facts. */
function candidateFacts(candidate: CompromiseCandidate): unknown {
  return {
    day: candidate.day,
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    goingCount: candidate.goingCount,
    driveMinutes: candidate.driveMinutes,
    cost: candidate.cost,
    facts: candidate.facts,
    place: candidate.placeName,
  };
}
