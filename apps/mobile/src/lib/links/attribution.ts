/**
 * The phone-match hook: right after a phone number is verified, ask the server whether a pending
 * seat invite was addressed to that number (matched on its peppered hash server-side; the number
 * never travels here). A match routes like any claimed link; no match changes nothing.
 */
import type { DeferredDeps } from './deferred';
import { parseLinkPath } from '@cp/domain';

import { routeTarget } from './router';

export type PhoneMatchOutcome =
  { readonly kind: 'matched'; readonly href: string } | { readonly kind: 'no_match' };

export async function claimAfterPhoneVerified(
  deps: Pick<DeferredDeps, 'client' | 'device' | 'track'>,
): Promise<PhoneMatchOutcome> {
  const claim = await deps.client.claim({ phone: true }, deps.device);
  if (claim.status !== 'claimed' || !claim.result.matched || claim.result.link === null) {
    return { kind: 'no_match' };
  }
  const target = parseLinkPath(claim.result.link);
  if (target === null) return { kind: 'no_match' };
  deps.track?.({ name: 'install_attributed', via: 'phone' });
  return {
    kind: 'matched',
    href: await routeTarget(target, { via: 'phone', crewId: claim.result.crew_id }),
  };
}
