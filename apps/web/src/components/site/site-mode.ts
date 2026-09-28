/**
 * Which front door `/` shows. Production keeps serving the coming-soon page (with its live
 * waitlist) until launch; every other environment shows the full site. Set per environment with
 * the Worker variable `SITE_MODE` (`coming-soon` | `site`); unset means `site`.
 */
export type SiteMode = 'coming-soon' | 'site';

export function siteMode(value: string | undefined): SiteMode {
  return value === 'coming-soon' ? 'coming-soon' : 'site';
}
