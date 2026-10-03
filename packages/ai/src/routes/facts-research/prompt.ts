/**
 * The `facts.research` request: one code-built search per place (its names, city and the topics;
 * no user data, no dates beyond the year), and the instructions that turn the returned pages into
 * ENTRY, WEAR and KNOW BEFORE YOU GO proposals or a decline. The pages reach the model only as
 * untrusted data blocks with their URL and date.
 */
import type { GatewayInput } from '../../client';
import {
  userTurnWithData,
  wrapAllUntrusted,
  UNTRUSTED_CONTEXT,
} from '../../context/wrap-untrusted';
import type { WebResult } from '../../tools/web-search';
import type { HoursResearchPlace } from '../hours-research/prompt';
import {
  FACTS_DRESS_MAX,
  FACTS_ENTRY_MAX,
  FACTS_KNOW_COUNT,
  FACTS_KNOW_MAX,
  FACTS_RESEARCH_FORMAT,
} from './schema';

export const FACTS_RESEARCH_ROUTE = 'facts.research' as const;
export const FACTS_RESEARCH_PROMPT_VERSION = 'facts-research@1';

/** The place being researched: the same fields as opening-hours research. */
export type FactsResearchPlace = HoursResearchPlace;

const QUERY_MAX = 200;
const TOPICS = 'entrance fee dress code visitor tips';

/** The one web search for a place: its names and city, then the topics. */
export function factsResearchQuery(place: FactsResearchPlace): string {
  const local =
    place.localName !== null && place.localName.trim() !== '' && place.localName !== place.name
      ? ` ${place.localName.trim()}`
      : '';
  const city = place.city.split(',')[0]?.trim() ?? place.city;
  const head = `${place.name.trim()}${local}`.slice(0, QUERY_MAX - city.length - TOPICS.length - 2);
  return `${head} ${city} ${TOPICS}`;
}

const TASK = [
  '# Task',
  '',
  'A travel editor needs three short facts about one place for its page, each from a web result',
  'about this exact place (same name and city, not a neighbour or a tour that includes it).',
  `- entry: the entry fee for one adult visitor as written on the page, at most ${FACTS_ENTRY_MAX}`,
  '  characters ("Rp 75k", "¥500", "Free"). Keep the currency and the amount the page gives;',
  '  never convert, round or add a price the page does not state. null when no result states it,',
  '  or when results disagree.',
  `- dress: what visitors must wear or cover, a few words, at most ${FACTS_DRESS_MAX - 8} characters,`,
  '  in the page\'s own words ("Sarong", "Cover shoulders"). null when no result says.',
  `- know_before: up to ${FACTS_KNOW_COUNT} things a visitor should know before going (queues,`,
  `  closures, steps, cash only), each at most ${FACTS_KNOW_MAX} characters, using only what the`,
  '  page says. Not opening hours (they come from elsewhere), no prices of tours, transfers or',
  '  packages, nothing about a seller.',
  '- Each fact gives source_url, the one result URL that says it, and quote, the sentence from',
  '  that result copied exactly (it must contain every number the fact uses).',
  '- The result text shown here is all you know: never use what you remember.',
  '- Decline (decision "decline", every field null or empty) when no result is about this place',
  '  or none states any of these facts.',
  '- confidence: how sure you are the facts are current (0 to 1).',
  '- reason: one short sentence on what the pages say, or why you declined.',
  UNTRUSTED_CONTEXT,
].join('\n');

function placeLine(place: FactsResearchPlace): string {
  const parts = [
    `Place: ${place.name}`,
    place.localName !== null && place.localName !== place.name ? `(${place.localName})` : '',
    `in ${place.city}`,
    `category: ${place.category}`,
    place.address === null ? '' : `address: ${place.address}`,
  ];
  return parts.filter((part) => part !== '').join(', ');
}

export function buildFactsResearchRequest(
  place: FactsResearchPlace,
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
    messages: [
      userTurnWithData(
        `${placeLine(place)}. Give its entry fee, what to wear and what to know before going.`,
        blocks,
      ),
    ],
    outputFormat: FACTS_RESEARCH_FORMAT,
    temperature: 0,
  };
}
