/**
 * Viator affiliate links, the truthful path while the booking API is off: Viator's own page with
 * our partner id (`pid`), the affiliate channel (`mcid`), and the click's opaque sub id as
 * `campaign`, which Viator reports back as the booking's campaign value.
 */
import { partnerPage, withParams, type LinkTarget } from '../links/link-spec';

export const VIATOR_HOSTS = ['viator.com'] as const;

export interface ViatorAffiliateConfig {
  readonly pid: string;
  readonly mcid: string;
}

export function viatorPage(target: LinkTarget): string {
  return (
    partnerPage(target, VIATOR_HOSTS) ??
    withParams('https://www.viator.com/searchResults/all', { text: target.query })
  );
}

export function viatorAffiliateLink(
  config: ViatorAffiliateConfig,
  target: LinkTarget,
  subId: string,
): string {
  return withParams(viatorPage(target), {
    pid: config.pid,
    mcid: config.mcid,
    medium: 'link',
    campaign: subId,
  });
}
