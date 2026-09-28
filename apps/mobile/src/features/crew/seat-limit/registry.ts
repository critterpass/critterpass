/**
 * Where a `SEAT_LIMIT` answer goes (the seat cap contract): every join path hands the detail to
 * the registered presenter. This area ships the default, a truthful waitlist sheet; the boost area
 * registers its "Seven's a crowd" sheet in its place and reuses the waitlist path for "Keep it at
 * six". Never an error toast.
 */
import type { InviteSeatLimitDetail } from '@cp/domain';
import { createElement, type ComponentType, type ReactElement } from 'react';

import { WaitlistSheet } from './WaitlistSheet';

export interface SeatLimitPresenterProps {
  readonly detail: InviteSeatLimitDetail;
  /** The trip's place (or crew name) the copy names. */
  readonly tripName: string;
  /** Put the invitee on the waitlist instead (the same invite, waitlisted). */
  readonly onWaitlist: () => void;
  readonly onDismiss: () => void;
}

export type SeatLimitPresenter = ComponentType<SeatLimitPresenterProps>;

let presenter: SeatLimitPresenter | null = null;

export function registerSeatLimitPresenter(next: SeatLimitPresenter): () => void {
  presenter = next;
  return () => {
    if (presenter === next) presenter = null;
  };
}

/** The registered presenter, or the default waitlist sheet. */
export function seatLimitPresenter(): SeatLimitPresenter {
  return presenter ?? WaitlistSheet;
}

/** The seat-limit detail of a rejected command, when that is what it is. */
export function seatLimitDetail(code: string, detail: unknown): InviteSeatLimitDetail | null {
  if (code !== 'SEAT_LIMIT') return null;
  const d = detail as Partial<InviteSeatLimitDetail> | null;
  if (typeof d?.cap !== 'number' || typeof d.trip_id !== 'string') return null;
  return {
    cap: d.cap,
    offer: d.offer === 'waitlist' ? 'waitlist' : 'boost',
    trip_id: d.trip_id,
    invitee: typeof d.invitee === 'string' ? d.invitee : null,
    seats_taken: typeof d.seats_taken === 'number' ? d.seats_taken : d.cap,
  };
}

/** The seat-limit sheet for `props`, from whichever presenter is registered. */
export function renderSeatLimit(props: SeatLimitPresenterProps): ReactElement {
  return createElement(seatLimitPresenter(), props);
}
