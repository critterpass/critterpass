/**
 * Which domain events move which Live Activity (docs/api-contracts-async.md §2.2 `la.orchestrate`):
 * each maps an event's payload to the object whose activities must be rebuilt. Both the api and
 * the worker hook the events they append through this one table, in the appending transaction.
 * Boost changes are trip-wide: they re-run every live meet-up of the trip (resolved by the hook).
 */
import type { LaKind } from './la-common';

export interface LaTarget {
  readonly kind: LaKind;
  readonly refId: string;
}

type Payload = Readonly<Record<string, unknown>>;

const id = (payload: Payload, key: string): string | null => {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const on =
  (kind: LaKind, key: string) =>
  (payload: Payload): LaTarget | null => {
    const refId = id(payload, key);
    return refId === null ? null : { kind, refId };
  };

export const LA_EVENT_TARGETS: Readonly<Record<string, (payload: Payload) => LaTarget | null>> = {
  'leave_by.changed': on('leave_by', 'leave_by_id'),
  'leave_by.snoozed': on('leave_by', 'leave_by_id'),
  'leave_by.knocked': on('leave_by', 'leave_by_id'),
  'readiness.changed': on('leave_by', 'leave_by_id'),
  'meetup.created': on('meet_up', 'meetup_id'),
  'meetup.moved': on('meet_up', 'meetup_id'),
  'meetup.crew_close': on('meet_up', 'meetup_id'),
  'member.running_late': on('meet_up', 'meetup_id'),
  'la.crew_requested': on('meet_up', 'meetup_id'),
  'boarding.soon': on('flight', 'segment_id'),
  'flight.status_changed': on('flight', 'segment_id'),
  'flight.boarding_open': on('flight', 'segment_id'),
  'flight.landed': on('flight', 'segment_id'),
  'poll.closing_soon': on('vote', 'poll_id'),
  'poll.lead_changed': on('vote', 'poll_id'),
  'poll.closed': on('vote', 'poll_id'),
  'poll.cancelled': on('vote', 'poll_id'),
  'ballot.cast': on('vote', 'poll_id'),
  'ballot.changed': on('vote', 'poll_id'),
  'ballot.retracted': on('vote', 'poll_id'),
};

/** Boost events re-run the trip's live meet-up activities (a lapsed boost ends them). */
export const LA_BOOST_EVENTS: ReadonlySet<string> = new Set([
  'boost.activated',
  'boost.ended',
  'boost.revoked',
  'boost.moved',
]);

export function isLaTriggerEvent(type: string): boolean {
  return type in LA_EVENT_TARGETS || LA_BOOST_EVENTS.has(type);
}
