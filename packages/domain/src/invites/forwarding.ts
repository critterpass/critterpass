/**
 * Personal links and forwarding. A personal invite reserves a named seat for the contact the
 * inviter picked; its link carries a seat token. Whoever opens that link first while the seat is
 * still open claims it as the named invitee, unless the invite was addressed to a phone number and
 * the opener's verified phone is a different one. Anyone else holding the same link (it was
 * forwarded, or opened again after the claim) sees "a seat in {crew}" without the invitee's name
 * and joins through a generic seat, never the named one.
 */

export type LinkOpenKind = 'personal' | 'forwarded' | 'generic';

export interface PersonalSeatFacts {
  /** The invite's status right now (after expiry is applied). */
  readonly open: boolean;
  /** Who claimed the named seat, if anyone. */
  readonly claimedBy: string | null;
  /** HMAC of the phone the inviter picked, when they picked one. */
  readonly phoneHash: string | null;
}

export interface OpenerFacts {
  readonly uid: string;
  /** HMAC of the opener's verified phone, when verified. */
  readonly phoneHash: string | null;
}

/** How a claim through a personal link is treated. */
export function classifyPersonalClaim(seat: PersonalSeatFacts, opener: OpenerFacts): LinkOpenKind {
  if (seat.claimedBy === opener.uid) return 'personal';
  if (!seat.open || seat.claimedBy !== null) return 'forwarded';
  if (seat.phoneHash !== null && opener.phoneHash !== null && seat.phoneHash !== opener.phoneHash) {
    return 'forwarded';
  }
  return 'personal';
}

/** Whether a link preview may name the invitee: only while the named seat is still open. */
export function previewShowsInviteeName(
  seat: Pick<PersonalSeatFacts, 'open' | 'claimedBy'>,
): boolean {
  return seat.open && seat.claimedBy === null;
}
