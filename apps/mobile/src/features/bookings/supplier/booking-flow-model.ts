/** An in-app Viator booking's steps, its lead traveller and the flow's props, and when the details are enough. */
import type { ReactNode } from 'react';

export type BookingStep =
  | 'choose'
  | 'details'
  | 'paying'
  | 'pending_operator'
  | 'confirmed'
  | 'rejected'
  | 'hold_expired'
  | 'unavailable';

export interface TravellerDetails {
  readonly first: string;
  readonly last: string;
  readonly phone: string;
  readonly email: string;
}

export interface BookingSheetProps {
  readonly step: BookingStep;
  readonly title: string;
  readonly dateLabel: string;
  readonly travellers: number;
  readonly onTravellers: (count: number) => void;
  /** The copy-rule line for the hold ("4 seats held until 14:20", "Book now · seats not held"). */
  readonly holdLine: string | null;
  readonly holdUntil: string | null;
  readonly onHoldExpired: () => void;
  readonly details: TravellerDetails;
  readonly onDetails: (details: TravellerDetails) => void;
  /** The result line ("Booked · Viator ref BR-1", "Waiting for the operator"). */
  readonly resultLine: string | null;
  readonly busy: boolean;
  readonly error: string | null;
  /** The payment form, while paying. */
  readonly payment?: ReactNode;
  readonly onHold: () => void;
  readonly onPay: () => void;
  readonly onRelease: () => void;
  readonly onOpenLink: () => void;
  readonly onDone: () => void;
}

export function detailsComplete(details: TravellerDetails): boolean {
  return (
    details.first.trim() !== '' &&
    details.last.trim() !== '' &&
    /^\+?[0-9 ()-]{6,24}$/u.test(details.phone.trim())
  );
}
