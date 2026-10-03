/**
 * Two ways nobody loses (route `places.compromise`): when the crew splits on a place, code builds
 * the candidates (the keen ones go early, an alternative, another day) and the guide picks two and
 * words them. The validator holds ids, numbers and names to the input; anything short of a clean
 * reply (the kill switch, a failed call, a decline, a slip) returns the first two candidates for
 * the caller's templates. Metered by its own silent fair-use cap, not the guide's.
 */
import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import { buildPlaceCompromiseRequest, PLACE_COMPROMISE_ROUTE } from './prompt';
import type { PlaceCompromiseInput, PlaceCompromiseResult } from './schema';
import { checkPlaceCompromiseReply } from './validate';

export * from './prompt';
export * from './schema';
export * from './validate';

export async function writePlaceCompromise(
  gateway: Pick<Gateway, 'callModel'>,
  input: PlaceCompromiseInput,
  options: { readonly signal?: AbortSignal; readonly usage?: UsageContext } = {},
): Promise<PlaceCompromiseResult> {
  const fallback = (reason: string): PlaceCompromiseResult => ({
    ok: false,
    reason,
    fallbackIds: input.candidates.slice(0, 2).map((candidate) => candidate.id),
  });
  if (input.candidates.length < 2) return fallback('too_few_candidates');
  try {
    const request = buildPlaceCompromiseRequest(input);
    const reply = await gateway.callModel(
      PLACE_COMPROMISE_ROUTE,
      options.signal ? { ...request, signal: options.signal } : request,
      options.usage ?? {},
    );
    if (isDeclined(reply.message)) return fallback('declined');
    return checkPlaceCompromiseReply(parseStructuredText(textOf(reply.message)), input);
  } catch {
    return fallback('call_failed');
  }
}
