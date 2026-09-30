/**
 * GetYourGuide's own activity search for a link, turned into our affiliate link by Travelpayouts
 * while the GYG partner API is off (`gyg_api`).
 */
import { partnerPage, withParams, type LinkTarget } from '../links/link-spec';

export const GYG_HOSTS = ['getyourguide.com'] as const;

export function gygPage(target: LinkTarget): string {
  return (
    partnerPage(target, GYG_HOSTS) ??
    withParams('https://www.getyourguide.com/s/', { q: target.query, date_from: target.date })
  );
}
