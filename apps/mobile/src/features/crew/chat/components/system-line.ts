/**
 * Copy for `system` rows, by the member's first name: joins, departures and renames, each member's
 * own answer to a proposal, and the lock (by the organiser, or by itself at reply-by).
 */
import { t } from '@lingui/core/macro';

import { firstName } from '../data/use-typing';

export function systemLine(
  refKind: string | null,
  who: string | null | undefined,
  body: string,
): string {
  const name = firstName(who) ?? t({ id: 'chat.system.someone', message: 'Someone' });
  switch (refKind) {
    case 'member_joined':
      return t({ id: 'chat.system.joined', message: `${name} joined the crew` });
    case 'member_left':
      return t({ id: 'chat.system.left', message: `${name} left the crew` });
    case 'crew_renamed':
      return t({ id: 'chat.system.renamed', message: `${name} renamed the crew to ${body}` });
    case 'rsvp_in':
      return t({ id: 'chat.system.rsvpIn', message: `${name} is in` });
    case 'rsvp_maybe':
      return t({ id: 'chat.system.rsvpMaybe', message: `${name} is a maybe` });
    case 'rsvp_out':
      return t({ id: 'chat.system.rsvpOut', message: `${name} can't make it` });
    case 'rsvp_waitlisted':
      return t({ id: 'chat.system.rsvpWaitlisted', message: `${name} is on the waitlist` });
    case 'trip_locked':
      return firstName(who) === null
        ? t({ id: 'chat.system.tripLockedAuto', message: 'The trip is locked in' })
        : t({ id: 'chat.system.tripLocked', message: `${name} locked the trip in` });
    case null:
    default:
      return body;
  }
}
