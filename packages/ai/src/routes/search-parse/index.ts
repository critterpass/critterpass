/**
 * Plain words into search chips (route `search.parse`, fast tier, no thinking, temperature 0, no
 * tools): "quiet dinner near the villa, open late" becomes DINNER · QUIET · ≤ 15 MIN FROM THE VILLA
 * · OPEN PAST 22:00 · NOT WED. Anything short of a clean reply (the kill switch, a failed call, a
 * decline, bad JSON, an unknown ref) is a plain name search over the question, so search never
 * waits on the model to work. Metered by its own silent fair-use cap, not the guide's.
 */
import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import { buildSearchParseRequest, SEARCH_PARSE_ROUTE, type SearchParseInput } from './prompt';
import type { SearchParseResult } from './schema';
import { checkSearchParseReply, fallbackSearchParse } from './validate';

export * from './prompt';
export * from './schema';
export * from './validate';

export interface SearchParseOutcome {
  readonly result: SearchParseResult;
  readonly fallbackUsed: boolean;
  /** Why the model's reply was not used, when it was not. */
  readonly rejected?: string;
}

export async function parseSearch(
  gateway: Pick<Gateway, 'callModel'>,
  input: SearchParseInput,
  options: { readonly signal?: AbortSignal; readonly usage?: UsageContext } = {},
): Promise<SearchParseOutcome> {
  const fallback = (rejected: string): SearchParseOutcome => ({
    result: fallbackSearchParse(input.question),
    fallbackUsed: true,
    rejected,
  });
  if (input.question.trim() === '') return fallback('empty');
  try {
    const request = buildSearchParseRequest(input);
    const reply = await gateway.callModel(
      SEARCH_PARSE_ROUTE,
      options.signal ? { ...request, signal: options.signal } : request,
      options.usage ?? {},
    );
    if (isDeclined(reply.message)) return fallback('declined');
    const check = checkSearchParseReply(
      parseStructuredText(textOf(reply.message)),
      input.question,
      input.digest,
    );
    return check.ok ? { result: check.result, fallbackUsed: false } : fallback(check.reason);
  } catch {
    return fallback('call_failed');
  }
}
