/**
 * What "Our drivers" (6g-3) shows for one driver: listed, the not-claimed timeline (invite sent,
 * link opened, waiting) with its expiry and the one nudge, an invite that ended, or nothing yet
 * (rate him, then invite him). Pure, so the states are tested without a screen.
 */
import type { OurDriver } from '@cp/domain';

export type OurDriverState =
  | { readonly kind: 'listed'; readonly paused: boolean }
  | {
      readonly kind: 'waiting';
      readonly inviteId: string;
      readonly sentAt: string;
      readonly openedAt: string | null;
      readonly expiresAt: string;
      readonly canNudge: boolean;
    }
  | { readonly kind: 'ended'; readonly reason: 'expired' | 'cancelled' | 'declined' }
  | { readonly kind: 'not_invited'; readonly rated: boolean };

export function ourDriverState(driver: OurDriver, now: Date): OurDriverState {
  if (driver.listing_status !== null) {
    return { kind: 'listed', paused: driver.listing_status === 'paused' };
  }
  const invite = driver.invite;
  if (invite === null || invite.status === 'claimed') {
    return { kind: 'not_invited', rated: driver.my_verdict !== null };
  }
  if (invite.status === 'cancelled' || invite.status === 'declined') {
    return { kind: 'ended', reason: invite.status };
  }
  if (invite.status === 'expired' || Date.parse(invite.expires_at) <= now.getTime()) {
    return { kind: 'ended', reason: 'expired' };
  }
  return {
    kind: 'waiting',
    inviteId: invite.id,
    sentAt: invite.sent_at,
    openedAt: invite.opened_at,
    expiresAt: invite.expires_at,
    canNudge: invite.nudged_at === null,
  };
}
