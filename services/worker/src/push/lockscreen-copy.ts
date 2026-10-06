/**
 * What a push or Live Activity says to someone who hides details on the lock screen
 * (`user_settings.hide_lockscreen_details`, docs/product-decisions.md): no money amounts and no exact
 * places. Each template that carries one has a sibling worded without it, so the sentence still
 * reads naturally; the router and the Live Activity orchestrator swap the template, never the
 * values. A destination name ("It's on: Đà Nẵng") is not an exact place and stays; free text a
 * guide or the plan wrote (a disruption headline, a briefing line) may name a place, so it is
 * replaced too. Names stay: who did something is the point of a push.
 */
import type { Copy } from './render';

const REDACTED: Readonly<Record<string, Copy>> = {
  // Money amounts.
  'notifications.money.expense_added': /*i18n*/ {
    id: 'notifications.lockscreen.money.expense_added',
    message: '{payer} added an expense you share.',
  },
  'notifications.money.requested': /*i18n*/ {
    id: 'notifications.lockscreen.money.requested',
    message: '{payee} asked you to settle up.',
  },
  'notifications.money.confirmed': /*i18n*/ {
    id: 'notifications.lockscreen.money.confirmed',
    message: '{payee} got your payment. All clear.',
  },
  'notifications.money.disputed': /*i18n*/ {
    id: 'notifications.lockscreen.money.disputed',
    message: '{payee} hasn’t seen your payment yet. Check the transfer?',
  },
  'notifications.money.nudged': /*i18n*/ {
    id: 'notifications.lockscreen.money.nudged',
    message: '{payee} nudged you about a payment. Gently.',
  },
  'notifications.money.marked_paid': /*i18n*/ {
    id: 'notifications.lockscreen.money.marked_paid',
    message: '{payer} says they paid you. Got it?',
  },
  'notifications.money.reminded': /*i18n*/ {
    id: 'notifications.lockscreen.money.reminded',
    message: 'Settle-up time: you owe {payee}.',
  },
  // Where to be and when.
  'notifications.trip_day.alarm_title': /*i18n*/ {
    id: 'notifications.lockscreen.trip_day.alarm_title',
    message: 'Leave by {time}',
  },
  'notifications.trip_day.alarm_title_be_there': /*i18n*/ {
    id: 'notifications.lockscreen.trip_day.alarm_title_be_there',
    message: 'Be there by {time}',
  },
  'notifications.trip_day.knock_title': /*i18n*/ {
    id: 'notifications.lockscreen.trip_day.knock_title',
    message: 'Leave by {time}',
  },
  'notifications.trip_day.knock_title_be_there': /*i18n*/ {
    id: 'notifications.lockscreen.trip_day.knock_title_be_there',
    message: 'Be there by {time}',
  },
  'notifications.trip_day.briefing_body': /*i18n*/ {
    id: 'notifications.lockscreen.trip_day.briefing_body',
    message: 'Your briefing for today is ready.',
  },
  'notifications.disruption.late_title': /*i18n*/ {
    id: 'notifications.lockscreen.disruption.late_title',
    message: 'Running late · +{minutes} min',
  },
  'notifications.disruption.needs_yes_title': /*i18n*/ {
    id: 'notifications.lockscreen.disruption.needs_yes_title',
    message: 'A plan change needs your yes',
  },
  'notifications.disruption.needs_yes_body': /*i18n*/ {
    id: 'notifications.lockscreen.disruption.needs_yes_body',
    message: 'Open the trip to decide.',
  },
  'notifications.vendor.draft_ready_body': /*i18n*/ {
    id: 'notifications.lockscreen.vendor.draft_ready_body',
    message: 'A message to a place is ready for your yes.',
  },
  'notifications.disruption.done_title': /*i18n*/ {
    id: 'notifications.lockscreen.disruption.done_title',
    message: 'Your plan changed',
  },
  'notifications.disruption.done_body': /*i18n*/ {
    id: 'notifications.lockscreen.disruption.done_body',
    message: 'Open the trip to see what changed.',
  },
  'notifications.disruption.watch_title': /*i18n*/ {
    id: 'notifications.lockscreen.disruption.watch_title',
    message: 'Forecast watch',
  },
  'notifications.disruption.watch_body': /*i18n*/ {
    id: 'notifications.lockscreen.disruption.watch_body',
    message: 'Open the trip to see the forecast.',
  },
  'notifications.meetup_changed.created': /*i18n*/ {
    id: 'notifications.lockscreen.meetup_changed.created',
    message: '{sender} set a meet-up for {time}.',
  },
  'notifications.meetup_changed.moved': /*i18n*/ {
    id: 'notifications.lockscreen.meetup_changed.moved',
    message: '{sender} moved the meet-up to {time}.',
  },
  'notifications.meetup_changed.crew_close': /*i18n*/ {
    id: 'notifications.lockscreen.meetup_changed.crew_close',
    message: 'Everyone’s nearly at the meet-up.',
  },
  'notifications.crew_ping.ping_meetup': /*i18n*/ {
    id: 'notifications.lockscreen.crew_ping.ping_meetup',
    message: 'Meet-up at {time}.',
  },
  // Bookings name the hotel or venue in their title.
  'notifications.bookings.deadline_body': /*i18n*/ {
    id: 'notifications.lockscreen.bookings.deadline_body',
    message:
      'A booking can be cancelled for free until {deadline}. After that the booking’s own terms apply.',
  },
  'notifications.bookings.found_body': /*i18n*/ {
    id: 'notifications.lockscreen.bookings.found_body',
    message: 'Found a booking in {member}’s email. Add it to the wallet?',
  },
  // Live Activities.
  'notifications.la.leave_by_start_title': /*i18n*/ {
    id: 'notifications.lockscreen.la.leave_by_start_title',
    message: 'Leave by {time}',
  },
  'notifications.la.leave_by_go_title': /*i18n*/ {
    id: 'notifications.lockscreen.la.leave_by_go_title',
    message: 'Time to go',
  },
  'notifications.la.leave_by_late_title': /*i18n*/ {
    id: 'notifications.lockscreen.la.leave_by_late_title',
    message: 'Running late',
  },
  'notifications.la.leave_by_be_at': /*i18n*/ {
    id: 'notifications.lockscreen.la.leave_by_be_at',
    message: 'Be there',
  },
  'notifications.la.leave_by_be_there_start_title': /*i18n*/ {
    id: 'notifications.lockscreen.la.leave_by_be_there_start_title',
    message: 'Be there by {time}',
  },
  'notifications.la.leave_by_be_there_go_title': /*i18n*/ {
    id: 'notifications.lockscreen.la.leave_by_be_there_go_title',
    message: 'Time to be there',
  },
  'notifications.la.meet_up_start_title': /*i18n*/ {
    id: 'notifications.lockscreen.la.meet_up_start_title',
    message: 'Meet-up · {time}',
  },
  'notifications.la.meet_up_late_title': /*i18n*/ {
    id: 'notifications.lockscreen.la.meet_up_late_title',
    message: 'Meet-up · {time}',
  },
  'notifications.la.meet_up_arrived_title': /*i18n*/ {
    id: 'notifications.lockscreen.la.meet_up_arrived_title',
    message: 'Everyone is at the meet-up',
  },
};

/** The template ids that have a lock-screen sibling. */
export const LOCKSCREEN_REDACTED_IDS: ReadonlySet<string> = new Set(Object.keys(REDACTED));

/** The template to render: its lock-screen sibling when `hide` is set and it has one. */
export function lockscreenCopy<T extends Copy>(copy: T, hide: boolean): T | Copy {
  return hide ? (REDACTED[copy.id] ?? copy) : copy;
}
