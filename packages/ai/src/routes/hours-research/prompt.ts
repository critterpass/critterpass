/**
 * The `hours.research` request: one code-built search per place (its names, city and "opening
 * hours"; no user data), and the instructions that turn the returned pages into one weekly schedule
 * or a decline. The pages reach the model only as untrusted data blocks with their URL and date.
 */
import type { GatewayInput } from '../../client';
import {
  userTurnWithData,
  wrapAllUntrusted,
  UNTRUSTED_CONTEXT,
} from '../../context/wrap-untrusted';
import type { WebResult } from '../../tools/web-search';
import { HOURS_RESEARCH_FORMAT } from './schema';

export const HOURS_RESEARCH_ROUTE = 'hours.research' as const;
export const HOURS_RESEARCH_PROMPT_VERSION = 'hours-research@2';

export interface HoursResearchPlace {
  readonly name: string;
  readonly localName: string | null;
  readonly address: string | null;
  /** The destination, e.g. "Kyoto, Japan". */
  readonly city: string;
  readonly category: string;
}

const QUERY_MAX = 200;

/** The one web search for a place: its names and city, then "opening hours". */
export function hoursResearchQuery(place: HoursResearchPlace): string {
  const local =
    place.localName !== null && place.localName.trim() !== '' && place.localName !== place.name
      ? ` ${place.localName.trim()}`
      : '';
  const city = place.city.split(',')[0]?.trim() ?? place.city;
  const head = `${place.name.trim()}${local}`.slice(0, QUERY_MAX - city.length - 16);
  return `${head} ${city} opening hours`;
}

const TASK = [
  '# Task',
  '',
  'A travel editor needs the regular weekly opening hours of one place. Read the web results and',
  'either propose one schedule or decline.',
  '- Propose only when a result about this exact place (same name and city, not a branch or a',
  '  neighbour) states its hours. The result text shown here is all you know: use only times',
  '  written in it, even when you remember others. Copy them exactly as 24-hour HH:MM local time;',
  '  never guess, round, average or fill a day the text does not cover.',
  '- A span runs from opening to closing time: when a page gives a last entry or last order',
  '  before closing ("8:45-17:00, last entry 16:00"), the span ends at closing (17:00).',
  '- source_url is the one result URL whose text states every time you give.',
  '- When a page lists several branches or sections, use only the lines for this place (its name',
  "  and address), never another branch's hours or a garden, palace or shop inside it.",
  '- Open a day only when the text says so: it names the day, says daily, or names the closing',
  '  days. Hours without days ("Open 9:00-17:00") are not enough; decline.',
  '- Days the page says are closed get an empty list. Two openings in one day (a lunch break) are',
  '  two spans. A span past midnight ends at its closing time on the next day ("18:00"-"02:00").',
  '- always_open is true only when a result says the place is open 24 hours every day; then give',
  '  every day as "00:00"-"24:00".',
  '- Decline when no result states the hours, when results disagree on the times or closing days,',
  '  when the hours change by season or month ("8:40-17:00 March to November, 8:40-16:30 December',
  '  to February"), when the page describes a past year, or when the place has closed for good.',
  '  A decline has empty days and source_url "".',
  '- confidence: how sure you are that the schedule is current and complete (0 to 1).',
  '- reason: one short sentence on what the page says, or why you declined.',
  UNTRUSTED_CONTEXT,
].join('\n');

function placeLine(place: HoursResearchPlace): string {
  const parts = [
    `Place: ${place.name}`,
    place.localName !== null && place.localName !== place.name ? `(${place.localName})` : '',
    `in ${place.city}`,
    `category: ${place.category}`,
    place.address === null ? '' : `address: ${place.address}`,
  ];
  return parts.filter((part) => part !== '').join(', ');
}

export function buildHoursResearchRequest(
  place: HoursResearchPlace,
  results: readonly WebResult[],
): GatewayInput {
  const blocks = wrapAllUntrusted(
    results.map((result) => ({
      kind: 'web_result' as const,
      text: result.snippet,
      source: result.url,
      label: result.title,
      at: result.published_at ?? `fetched ${result.fetched_at}`,
    })),
  );
  return {
    system: [{ type: 'text', text: TASK }],
    messages: [userTurnWithData(`${placeLine(place)}. Give its weekly opening hours.`, blocks)],
    outputFormat: HOURS_RESEARCH_FORMAT,
    temperature: 0,
  };
}
