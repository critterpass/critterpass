/* eslint-disable lingui/no-unlocalized-strings -- link pages ship single-locale English like the rest
   of the site, which isn't wired through @cp/i18n; see src/lib/guides.ts. */
/**
 * The words on a link page, from the target and its public preview. Invites follow the Site-Invite
 * design ("Winston wants you in Bali"); every other kind and every non-active invite state gets a
 * short, plain card (logged in docs/undesigned-states.md).
 */
import type { LinkPreview, LinkTarget } from '@cp/domain';

export interface HandoffCopy {
  readonly eyebrow: string;
  readonly headline: string;
  readonly body: string | null;
  readonly cta: string;
  readonly chips: readonly string[];
  /** e.g. "4 already in · 1 spot with your name"; null when unknown. */
  readonly roster: string | null;
  readonly pageTitle: string;
  readonly pageDescription: string;
}

const BRAND = 'CritterPass';

function inviteCopy(target: LinkTarget, preview: LinkPreview | null): HandoffCopy {
  const inviter = preview?.inviter_first_name ?? null;
  const crew = preview?.crew_name ?? null;
  const where = preview?.trip_place ?? crew ?? 'the crew';
  const chips = [crew, preview?.trip_place ?? null].filter((chip): chip is string => chip !== null);
  const seat = target.kind === 'invite' && target.seat !== undefined;
  const roster =
    preview?.members_count == null
      ? null
      : `${preview.members_count} already in${seat ? ' · 1 spot with your name' : ''}`;
  const pageTitle =
    inviter === null ? `You're invited · ${BRAND}` : `${inviter} invited you · ${BRAND}`;
  const pageDescription =
    crew === null
      ? `Join the crew on ${BRAND}, the group trip planner.`
      : `Join ${crew} on ${BRAND}, the group trip planner.`;

  switch (preview?.state) {
    case 'expired':
      return {
        eyebrow: 'Invite expired',
        headline: 'This invite has run out',
        body: `Ask ${inviter ?? 'whoever sent it'} for a fresh code, then come back here.`,
        cta: `Get ${BRAND}`,
        chips,
        roster: null,
        pageTitle,
        pageDescription,
      };
    case 'revoked':
      return {
        eyebrow: 'Invite closed',
        headline: 'This invite was switched off',
        body: `${inviter ?? 'The organiser'} closed this code. Ask them for the current one.`,
        cta: `Get ${BRAND}`,
        chips,
        roster: null,
        pageTitle,
        pageDescription,
      };
    case 'full':
      return {
        eyebrow: 'Crew full',
        headline: 'Every seat is taken',
        body: `${crew ?? 'This crew'} has no seats left on this code. Ask ${inviter ?? 'the organiser'} to make room.`,
        cta: `Get ${BRAND}`,
        chips,
        roster,
        pageTitle,
        pageDescription,
      };
    case 'active':
    case undefined:
      return {
        eyebrow: "You're invited",
        headline: inviter === null ? `Join ${where}` : `${inviter} wants you in ${where}`,
        body: null,
        cta: crew === null ? 'Join the crew' : `Join ${crew}`,
        chips,
        roster,
        pageTitle,
        pageDescription,
      };
  }
}

function plainCopy(eyebrow: string, headline: string, cta: string, body: string): HandoffCopy {
  return {
    eyebrow,
    headline,
    body,
    cta,
    chips: [],
    roster: null,
    pageTitle: `${headline} · ${BRAND}`,
    pageDescription: body,
  };
}

export function handoffCopy(target: LinkTarget, preview: LinkPreview | null): HandoffCopy {
  const kind = preview?.kind ?? target.kind;
  switch (kind) {
    case 'invite':
      return inviteCopy(target, preview);
    case 'referral': {
      const inviter = preview?.inviter_first_name ?? null;
      return plainCopy(
        "You're invited",
        inviter === null ? `Plan your next trip on ${BRAND}` : `${inviter} wants you on ${BRAND}`,
        `Get ${BRAND}`,
        'Group trips, planned with the locals. Open the app with this link and your invite comes along.',
      );
    }
    case 'plan_share':
      return plainCopy(
        'Shared plan',
        'A trip plan, shared with you',
        'Open the plan',
        `See every day of this trip in ${BRAND}.`,
      );
    case 'plan':
      return plainCopy(
        'Your crew',
        "Your crew's plan",
        `Open in ${BRAND}`,
        `This plan lives in ${BRAND}. Open the app to see it.`,
      );
    case 'guide':
      return plainCopy(
        'Your guide',
        'Meet your guide',
        `Open in ${BRAND}`,
        'A local guide who plans with your crew.',
      );
    case 'locals':
      return plainCopy(
        'The locals',
        'Meet the locals',
        `Open in ${BRAND}`,
        'Critters you meet on the road, one place at a time.',
      );
    case 'app':
      return plainCopy(
        BRAND,
        `Open in ${BRAND}`,
        `Open in ${BRAND}`,
        `This link opens a screen in the ${BRAND} app.`,
      );
  }
}

export const NOT_FOUND_COPY = plainCopy(
  'Link not found',
  "This link doesn't work",
  `Get ${BRAND}`,
  'It may have a typo, or it has been replaced. Ask whoever sent it for their six-character code.',
);

/** "Expires in 3d 23h" style, or null when the code never expires or already has. */
export function expiresIn(expiresAt: string | null, now: Date): string | null {
  if (expiresAt === null) return null;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (!(ms > 0)) return null;
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `Expires in ${days}d ${hours % 24}h`;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `Expires in ${hours}h ${minutes}m`;
}
