/**
 * One ride quote: Grab's Farefeed estimate where Grab runs, its partner switch is on and the
 * deployment has Grab credentials; the plain app links for the market either way. A Farefeed
 * failure never fails the quote: the traveller still gets the links and the phrase card, which is
 * exactly what the switched-off path shows.
 */
import type { RideApp, RideLink } from '@cp/domain';

import type { SupplierHttp } from '../core/http';
import { fetchFarefeed, leadService, type FarefeedService } from '../grab/farefeed';
import type { GrabConfig, GrabTokenSource } from '../grab/oauth';
import { rideAppLink } from './links';

export interface GrabEstimator {
  readonly http: SupplierHttp;
  readonly config: GrabConfig;
  readonly tokens: GrabTokenSource;
}

export interface RideQuoteRequest {
  readonly apps: readonly RideApp[];
  /** Whether the Grab Farefeed partner switch is on. */
  readonly estimateEnabled: boolean;
  readonly from: { readonly lat: number; readonly lng: number; readonly name?: string };
  readonly to: { readonly lat: number; readonly lng: number; readonly name: string };
}

export interface RideQuote {
  readonly estimate: FarefeedService | null;
  /** Why no estimate came back, for logs only. */
  readonly estimateSkipped: 'no_grab' | 'flag_off' | 'not_configured' | 'failed' | 'empty' | null;
  readonly links: readonly RideLink[];
}

export async function quoteRide(
  grab: GrabEstimator | undefined,
  request: RideQuoteRequest,
  onError: (error: unknown) => void = () => undefined,
): Promise<RideQuote> {
  const links = request.apps.map((app) => rideAppLink(app, request.to));
  if (!request.apps.includes('grab')) return { estimate: null, estimateSkipped: 'no_grab', links };
  if (!request.estimateEnabled) return { estimate: null, estimateSkipped: 'flag_off', links };
  if (grab === undefined) return { estimate: null, estimateSkipped: 'not_configured', links };
  try {
    const services = await fetchFarefeed(
      grab.http,
      grab.config,
      grab.tokens,
      {
        lat: request.from.lat,
        lng: request.from.lng,
        ...(request.from.name ? { address: request.from.name } : {}),
      },
      { lat: request.to.lat, lng: request.to.lng, address: request.to.name },
    );
    const lead = leadService(services);
    return lead === undefined
      ? { estimate: null, estimateSkipped: 'empty', links }
      : { estimate: lead, estimateSkipped: null, links };
  } catch (error) {
    onError(error);
    return { estimate: null, estimateSkipped: 'failed', links };
  }
}
