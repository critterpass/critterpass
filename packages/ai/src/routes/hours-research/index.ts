/**
 * Opening-hours research (route `hours.research`, fast tier, structured; docs/product-decisions.md
 * D23): for one curated place, code runs one `web_search` (names, city, "opening hours"; supplier
 * pages are screened out by the tool), the model proposes one weekly schedule from the pages or
 * declines, and code keeps the proposal only when it cites a returned page whose own text carries
 * every time used (./validate.ts). Places without hours of their own are skipped before any call.
 * The result is a proposal for an operator to verify, never hours a place shows on its own.
 */
import { needsHoursResearch } from '@cp/domain';

import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { SearchProvider } from '../../tools/search-provider';
import { createWebSearchExecutor, type WebResult } from '../../tools/web-search';
import type { UsageContext } from '../../usage';
import { buildHoursResearchRequest, hoursResearchQuery, HOURS_RESEARCH_ROUTE } from './prompt';
import type { HoursResearchPlace } from './prompt';
import { checkHoursReply, type HoursProposal } from './validate';

export * from './prompt';
export * from './schema';
export * from './validate';

/** The job has no user: searches run under the nil uid, with no crew terms to screen. */
const SYSTEM_UID = '00000000-0000-0000-0000-000000000000';

export interface HoursResearchDeps {
  readonly gateway: Pick<Gateway, 'callModel'>;
  readonly search: SearchProvider;
  readonly now?: () => Date;
}

export type HoursResearchResult =
  | { readonly ok: true; readonly proposal: HoursProposal; readonly costMicros: number }
  | { readonly ok: false; readonly reason: string; readonly costMicros: number };

/** The pages one place's search returned, screened by the `web_search` tool. */
export async function searchPlaceHours(
  search: SearchProvider,
  place: HoursResearchPlace,
  options: { readonly now?: () => Date; readonly signal?: AbortSignal } = {},
): Promise<WebResult[]> {
  const execute = createWebSearchExecutor(search, options.now ? { now: options.now } : {});
  const { results } = await execute(
    { query: hoursResearchQuery(place) },
    {
      uid: SYSTEM_UID,
      tripId: null,
      caller: 'R',
      route: HOURS_RESEARCH_ROUTE,
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );
  return results.map((result) => ({ ...result }));
}

/**
 * Researches one place. Search and model failures, and an ops kill switch (`switched_off`), throw:
 * the caller decides whether the run goes on.
 */
export async function researchPlaceHours(
  deps: HoursResearchDeps,
  place: HoursResearchPlace,
  options: { readonly signal?: AbortSignal; readonly usage?: UsageContext } = {},
): Promise<HoursResearchResult> {
  if (!needsHoursResearch(place.category)) {
    return { ok: false, reason: 'no_hours_category', costMicros: 0 };
  }
  const now = deps.now ?? (() => new Date());
  const results = await searchPlaceHours(deps.search, place, {
    now,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (results.length === 0) return { ok: false, reason: 'no_results', costMicros: 0 };
  const request = buildHoursResearchRequest(place, results);
  const reply = await deps.gateway.callModel(
    HOURS_RESEARCH_ROUTE,
    options.signal ? { ...request, signal: options.signal } : request,
    options.usage ?? {},
  );
  const costMicros = reply.costMicros;
  if (isDeclined(reply.message)) return { ok: false, reason: 'declined', costMicros };
  const check = checkHoursReply(parseStructuredText(textOf(reply.message)), results, now());
  return check.ok
    ? { ok: true, proposal: check.proposal, costMicros }
    : { ok: false, reason: check.reason, costMicros };
}
