/**
 * What the invite ticket (3a-10) and the code card (3a-11) show, derived from the link preview.
 * A named seat addresses the invitee by first name; a forwarded or generic link says "a seat in
 * {crew}" and never names anyone. The member stubs are the crew's own members; seats still waiting
 * on someone else are a count only. A full trip, an expired or revoked link and an unknown code are
 * states of the same card, never an error page.
 */
/* eslint-disable lingui/no-unlocalized-strings -- state discriminants, never copy. */
import type { LinkPreview } from '@cp/domain';

import type { PreviewResult } from '@/lib/links/resolver-client';

export type TicketStatus =
  | 'loading'
  | 'active'
  | 'full'
  | 'expired'
  | 'revoked'
  /** The code's use limit is spent (not the trip: a full trip still takes waitlisters). */
  | 'used_up'
  | 'not_found'
  | 'offline'
  | 'referral';

export interface TicketMember {
  readonly name: string;
  readonly colour: string | null;
}

export interface TicketModel {
  readonly status: TicketStatus;
  readonly crewName: string | null;
  readonly inviterFirstName: string | null;
  /** Only while the named seat is open: a forwarded link shows no name. */
  readonly inviteeFirstName: string | null;
  readonly place: string | null;
  readonly tripStart: string | null;
  readonly tripEnd: string | null;
  /** The seat the invitee would take (taken + 1) and the cap; null without a trip. */
  readonly seat: { readonly number: number; readonly cap: number } | null;
  readonly estimate: { readonly minor: number; readonly currency: string } | null;
  readonly members: readonly TicketMember[];
  /** Named seats still waiting on someone else. */
  readonly waiting: number;
  readonly guideSlug: string | null;
  readonly expiresAt: string | null;
}

const EMPTY: Omit<TicketModel, 'status'> = {
  crewName: null,
  inviterFirstName: null,
  inviteeFirstName: null,
  place: null,
  tripStart: null,
  tripEnd: null,
  seat: null,
  estimate: null,
  members: [],
  waiting: 0,
  guideSlug: null,
  expiresAt: null,
};

function statusOf(preview: LinkPreview): TicketStatus {
  if (preview.kind === 'referral') return 'referral';
  if (preview.state === 'expired') return 'expired';
  if (preview.state === 'revoked') return 'revoked';
  if (preview.state === 'full') return 'used_up';
  const cap = preview.seat_cap ?? null;
  const taken = preview.seats_taken ?? null;
  if (cap !== null && taken !== null && taken >= cap) return 'full';
  return 'active';
}

export function ticketModel(result: PreviewResult | null): TicketModel {
  if (result === null) return { status: 'loading', ...EMPTY };
  if (result.status === 'not_found') return { status: 'not_found', ...EMPTY };
  if (result.status === 'unavailable') return { status: 'offline', ...EMPTY };
  const p = result.preview;
  const cap = p.seat_cap ?? null;
  const taken = p.seats_taken ?? null;
  return {
    status: statusOf(p),
    crewName: p.crew_name,
    inviterFirstName: p.inviter_first_name,
    inviteeFirstName: p.invitee_first_name ?? null,
    place: p.trip_place,
    tripStart: p.trip_start ?? null,
    tripEnd: p.trip_end ?? null,
    seat: cap === null || taken === null ? null : { number: Math.min(taken + 1, cap), cap },
    estimate:
      p.estimate_minor == null || p.estimate_currency == null
        ? null
        : { minor: p.estimate_minor, currency: p.estimate_currency },
    members: (p.members ?? []).map((m) => ({ name: m.first_name, colour: m.colour })),
    waiting: p.invited_waiting ?? 0,
    guideSlug: p.guide_slug ?? null,
    expiresAt: p.expires_at,
  };
}

/** Whether taking the seat is possible from this state (a full trip joins the waitlist). */
export function canTakeSeat(status: TicketStatus): boolean {
  return status === 'active' || status === 'full';
}

/** The statuses that replace the ticket with a problem card (everything but loading and a seat). */
export type TicketProblemStatus = Exclude<TicketStatus, 'loading' | 'active' | 'full'>;

export function ticketProblem(status: TicketStatus): TicketProblemStatus | null {
  return status === 'loading' || status === 'active' || status === 'full' ? null : status;
}
