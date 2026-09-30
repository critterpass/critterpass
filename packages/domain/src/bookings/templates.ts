/**
 * Bookings copy the server renders into pushes and auto-replies (catalog id + source message; the
 * worker renders it in each recipient's language). Times arrive formatted in the booking's zone;
 * no push carries a confirmation code, a barcode or a sender address.
 */
export interface BookingCopy {
  readonly id: string;
  readonly message: string;
}

export const BOOKING_PUSH = {
  deadlineTitle: /*i18n*/ {
    id: 'notifications.bookings.deadline_title',
    message: 'Free cancellation ends tomorrow',
  },
  deadlineBody: /*i18n*/ {
    id: 'notifications.bookings.deadline_body',
    message: '{title}: cancel for free until {deadline}. After that the booking’s own terms apply.',
  },
  foundTitle: /*i18n*/ { id: 'notifications.bookings.found_title', message: '{crew}' },
  foundBody: /*i18n*/ {
    id: 'notifications.bookings.found_body',
    message: 'Found a booking in {member}’s email: {title}. Add it to the wallet?',
  },
  flightTitle: /*i18n*/ {
    id: 'notifications.bookings.flight_title',
    message: '{flight} · {route}',
  },
  delayed: /*i18n*/ {
    id: 'notifications.bookings.flight_delayed',
    message: 'Delayed {minutes} min. New departure {time}.',
  },
  gate: /*i18n*/ {
    id: 'notifications.bookings.flight_gate',
    message: 'Gate change: now gate {gate}.',
  },
  cancelled: /*i18n*/ {
    id: 'notifications.bookings.flight_cancelled',
    message: 'Cancelled by the airline. Open the card to see your options.',
  },
  diverted: /*i18n*/ {
    id: 'notifications.bookings.flight_diverted',
    message: 'Diverted. I’ll keep you posted.',
  },
  boardingTitle: /*i18n*/ {
    id: 'notifications.bookings.boarding_title',
    message: '{flight} is boarding',
  },
  boardingBody: /*i18n*/ {
    id: 'notifications.bookings.boarding_body',
    message: 'Boarding at gate {gate}. Your pass is in the wallet.',
  },
  boardingEstimated: /*i18n*/ {
    id: 'notifications.bookings.boarding_estimated',
    message: 'Boarding should open about now (est.). Your pass is in the wallet.',
  },
} as const;

/** The auto-reply an unknown sender gets from a crew address ("Link this email?"). */
export const LINK_EMAIL_REPLY = {
  subject: /*i18n*/ {
    id: 'email.bookings.link_subject',
    message: 'Link this email to CritterPass',
  },
  body: /*i18n*/ {
    id: 'email.bookings.link_body',
    message:
      'Someone forwarded a booking from this address to {crew} on CritterPass. If it was you, enter {code} in the app within 24 hours to link this email to your account. If it wasn’t, ignore this message and nothing will be imported.',
  },
} as const;
