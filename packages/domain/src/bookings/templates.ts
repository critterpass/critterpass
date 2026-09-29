/**
 * Bookings copy the server renders into pushes and auto-replies (catalog id + source message; the
 * worker renders it in each recipient's language). Times arrive formatted in the booking's zone;
 * no push carries a confirmation code, a barcode or a sender address.
 */
export interface BookingCopy {
  readonly id: string;
  readonly message: string;
}

const copy = (id: string, message: string): BookingCopy => ({ id, message });

export const BOOKING_PUSH = {
  deadlineTitle: copy('notifications.bookings.deadline_title', 'Free cancellation ends tomorrow'),
  deadlineBody: copy(
    'notifications.bookings.deadline_body',
    '{title}: cancel for free until {deadline}. After that the booking’s own terms apply.',
  ),
  foundTitle: copy('notifications.bookings.found_title', '{crew}'),
  foundBody: copy(
    'notifications.bookings.found_body',
    'Found a booking in {member}’s email: {title}. Add it to the wallet?',
  ),
  flightTitle: copy('notifications.bookings.flight_title', '{flight} · {route}'),
  delayed: copy(
    'notifications.bookings.flight_delayed',
    'Delayed {minutes} min. New departure {time}.',
  ),
  gate: copy('notifications.bookings.flight_gate', 'Gate change: now gate {gate}.'),
  cancelled: copy(
    'notifications.bookings.flight_cancelled',
    'Cancelled by the airline. Open the card to see your options.',
  ),
  diverted: copy('notifications.bookings.flight_diverted', 'Diverted. I’ll keep you posted.'),
  boardingTitle: copy('notifications.bookings.boarding_title', '{flight} is boarding'),
  boardingBody: copy(
    'notifications.bookings.boarding_body',
    'Boarding at gate {gate}. Your pass is in the wallet.',
  ),
  boardingEstimated: copy(
    'notifications.bookings.boarding_estimated',
    'Boarding should open about now (est.). Your pass is in the wallet.',
  ),
} as const;

/** The auto-reply an unknown sender gets from a crew address ("Link this email?"). */
export const LINK_EMAIL_REPLY = {
  subject: copy('email.bookings.link_subject', 'Link this email to CritterPass'),
  body: copy(
    'email.bookings.link_body',
    'Someone forwarded a booking from this address to {crew} on CritterPass. If it was you, enter {code} in the app within 24 hours to link this email to your account. If it wasn’t, ignore this message and nothing will be imported.',
  ),
} as const;
