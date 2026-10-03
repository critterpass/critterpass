/**
 * Place facts research (route `facts.research`, fast tier, structured; docs/product-decisions.md
 * D23 as amended for place facts): for one curated place, code runs one `web_search` (names, city
 * and the topics; supplier pages are screened out by the tool), the model proposes an entry fee,
 * what to wear and things to know, each citing a returned page and quoting it, or declines; code
 * keeps only the facts whose quote is on the cited page and carries every amount (./validate.ts).
 * The result is a proposal for an operator to approve in the ops console, never shown on its own.
 */
import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { SearchProvider } from '../../tools/search-provider';
import { createWebSearchExecutor, type WebResult } from '../../tools/web-search';
import type { UsageContext } from '../../usage';
import {
  buildFactsResearchRequest,
  factsResearchQuery,
  FACTS_RESEARCH_ROUTE,
  type FactsResearchPlace,
} from './prompt';
import { checkFactsReply, type FactsProposal } from './validate';

export * from './prompt';
export * from './schema';
export * from './validate';

/** The job has no user: searches run under the nil uid, with no crew terms to screen. */
const SYSTEM_UID = '00000000-0000-0000-0000-000000000000';

export interface FactsResearchDeps {
  readonly gateway: Pick<Gateway, 'callModel'>;
  readonly search: SearchProvider;
  readonly now?: () => Date;
}

export type FactsResearchResult =
  | {
      readonly ok: true;
      readonly proposal: FactsProposal;
      readonly dropped: readonly string[];
      readonly costMicros: number;
    }
  | { readonly ok: false; readonly reason: string; readonly costMicros: number };

/** The pages one place's search returned, screened by the `web_search` tool. */
export async function searchPlaceFacts(
  search: SearchProvider,
  place: FactsResearchPlace,
  options: { readonly now?: () => Date; readonly signal?: AbortSignal } = {},
): Promise<WebResult[]> {
  const execute = createWebSearchExecutor(search, options.now ? { now: options.now } : {});
  const { results } = await execute(
    { query: factsResearchQuery(place) },
    {
      uid: SYSTEM_UID,
      tripId: null,
      caller: 'R',
      route: FACTS_RESEARCH_ROUTE,
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );
  return results.map((result) => ({ ...result }));
}

/**
 * Researches one place. Search and model failures, and an ops kill switch (`switched_off`), throw:
 * the caller decides whether the run goes on.
 */
export async function researchPlaceFacts(
  deps: FactsResearchDeps,
  place: FactsResearchPlace,
  options: { readonly signal?: AbortSignal; readonly usage?: UsageContext } = {},
): Promise<FactsResearchResult> {
  const now = deps.now ?? (() => new Date());
  const results = await searchPlaceFacts(deps.search, place, {
    now,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (results.length === 0) return { ok: false, reason: 'no_results', costMicros: 0 };
  const request = buildFactsResearchRequest(place, results);
  const reply = await deps.gateway.callModel(
    FACTS_RESEARCH_ROUTE,
    options.signal ? { ...request, signal: options.signal } : request,
    options.usage ?? {},
  );
  const costMicros = reply.costMicros;
  if (isDeclined(reply.message)) return { ok: false, reason: 'declined', costMicros };
  const check = checkFactsReply(parseStructuredText(textOf(reply.message)), results, now());
  return check.ok
    ? { ok: true, proposal: check.proposal, dropped: check.dropped, costMicros }
    : { ok: false, reason: check.reason, costMicros };
}
