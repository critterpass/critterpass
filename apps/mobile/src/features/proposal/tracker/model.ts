/**
 * The tracker's reading of the crew (3f-6): each member's public status (IN, MAYBE, NO REPLY, OUT,
 * waitlisted), the counts the segment bar fills with, and whether the organiser can lock now (a
 * sent proposal with at least one recipient IN). An open is never a status here: "opened" reads
 * as no reply, so nobody learns who looked.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import type { CrewPerson } from '../data/trip';

export type PublicStatus = 'organiser' | 'in' | 'maybe' | 'no_reply' | 'out' | 'waitlisted';

export function publicStatus(person: CrewPerson): PublicStatus {
  if (person.organiser) return 'organiser';
  switch (person.rsvp) {
    case 'in':
    case 'maybe':
    case 'out':
    case 'waitlisted':
      return person.rsvp;
    case 'unopened':
    case 'opened':
      return 'no_reply';
  }
}

export interface Tally {
  readonly in: number;
  readonly maybe: number;
  readonly noReply: number;
  readonly out: number;
  readonly waitlisted: number;
}

/** Counts over the whole crew; the organiser counts as IN. */
export function tally(people: readonly CrewPerson[]): Tally {
  const counts = { in: 0, maybe: 0, noReply: 0, out: 0, waitlisted: 0 };
  for (const person of people) {
    const status = publicStatus(person);
    if (status === 'organiser' || status === 'in') counts.in += 1;
    else if (status === 'maybe') counts.maybe += 1;
    else if (status === 'no_reply') counts.noReply += 1;
    else if (status === 'out') counts.out += 1;
    else counts.waitlisted += 1;
  }
  return counts;
}

export type LockState =
  | {
      readonly kind: 'ready';
      readonly going: number;
      readonly maybes: number;
      readonly silent: number;
    }
  | { readonly kind: 'nobody_in' }
  /** Every recipient said they can't make it: the organiser can lock in alone. */
  | { readonly kind: 'alone' }
  | { readonly kind: 'locked' }
  | { readonly kind: 'not_sent' };

export function lockState(proposalStatus: string, recipients: readonly CrewPerson[]): LockState {
  if (proposalStatus === 'locked') return { kind: 'locked' };
  if (proposalStatus !== 'sent') return { kind: 'not_sent' };
  const going = recipients.filter((p) => p.rsvp === 'in').length;
  if (going === 0) {
    const allOut = recipients.length > 0 && recipients.every((p) => p.rsvp === 'out');
    return allOut ? { kind: 'alone' } : { kind: 'nobody_in' };
  }
  return {
    kind: 'ready',
    going,
    maybes: recipients.filter((p) => p.rsvp === 'maybe').length,
    silent: recipients.filter((p) => p.rsvp === 'unopened' || p.rsvp === 'opened').length,
  };
}
