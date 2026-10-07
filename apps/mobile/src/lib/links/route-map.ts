/**
 * Where each link lands inside the app (expo-router hrefs). The router decides gating first
 * (onboarding, membership, link state); this table only maps a gated decision to a screen.
 *
 * Screen owners read these params:
 * - `/onboarding/invite/ticket` (3a-10): `code`, optional `seat`, `kind` (`invite`|`referral`),
 *   `state` (`active`|`expired`|`revoked`|`full`) and `via` when it came from a deferred claim.
 * - `/onboarding/invite/code` (3a-11): optional `notice` (`invalid`) and `pasted` (the link).
 * - `/` (Home): optional `crewId` to focus, `notice` for a one-line toast (see `LinkNotice`) with
 *   `at`, the moment the link was routed: Home says each (`notice`, `at`) once, so the same notice
 *   from a later link is said again while a lingering address is not.
 */
import { currentAppPath, type AttributionVia, type LinkState, type LinkTarget } from '@cp/domain';

export const HOME_ROUTE = '/';
export const INVITE_TICKET_ROUTE = '/onboarding/invite/ticket';
export const CODE_ENTRY_ROUTE = '/onboarding/invite/code';
/** The PASS tab: the critter collection, set by set. */
export const PASS_TAB_ROUTE = '/pass';

/** Toast keys Home shows once for a link it could not follow. */
export type LinkNotice = 'link_unknown' | 'link_already_member' | 'link_unavailable';

export interface LinkFacts {
  /** From the resolver; null when offline or not resolvable (the target screen re-checks). */
  readonly state: LinkState | null;
  readonly crewId: string | null;
  /** Effective kind: an `/i/` code can turn out to be a referral code. */
  readonly kind: LinkTarget['kind'];
  readonly isMember: boolean;
  readonly via?: AttributionVia;
}

function href(pathname: string, params: Record<string, string | undefined>): string {
  const query = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return query === '' ? pathname : `${pathname}?${query}`;
}

export function homeWithNotice(notice: LinkNotice, at: number): string {
  return href(HOME_ROUTE, { notice, at: String(at) });
}

export function codeEntryRoute(params: { notice?: 'invalid'; pasted?: string } = {}): string {
  return href(CODE_ENTRY_ROUTE, params);
}

/** The in-app href for a signed-in, onboarded user following `target`. */
export function routeForTarget(target: LinkTarget, facts: LinkFacts, now: number): string {
  switch (target.kind) {
    case 'invite':
    case 'referral': {
      if (facts.kind === 'referral') return homeWithNotice('link_already_member', now);
      if (facts.isMember && facts.crewId !== null)
        return href(HOME_ROUTE, { crewId: facts.crewId });
      return href(INVITE_TICKET_ROUTE, {
        code: target.code,
        seat: target.kind === 'invite' ? target.seat : undefined,
        kind: facts.kind,
        state: facts.state ?? undefined,
        via: facts.via,
      });
    }
    case 'plan_share':
      return href(`/community/link/${encodeURIComponent(target.token)}`, {});
    case 'plan':
      return href(`/${target.id}/plan`, {});
    case 'guide':
      return href(`/explore/${target.slug}`, {});
    case 'locals':
      // A place's locals are its set in the collection, which the PASS tab lists by place.
      return PASS_TAB_ROUTE;
    case 'app':
      // Pushes and inbox rows sent earlier name the trip hub and its day by their former paths.
      return currentAppPath(`/${target.path}`);
  }
}

/** Before onboarding only invites and referrals have a screen of their own (the invite ticket). */
export function routeBeforeOnboarding(target: LinkTarget, facts: LinkFacts): string {
  if (target.kind !== 'invite' && target.kind !== 'referral') return HOME_ROUTE;
  return href(INVITE_TICKET_ROUTE, {
    code: target.code,
    seat: target.kind === 'invite' ? target.seat : undefined,
    kind: facts.kind,
    state: facts.state ?? undefined,
    via: facts.via,
  });
}
