/**
 * Copy for `system` rows, by the member's first name: joins, departures and renames, each member's
 * own answer to a proposal, the lock (by the organiser, or by itself at reply-by), and how a vote
 * on a plan change ended, naming what changed, and an organiser's own edit to the locked plan.
 */
import { parsePlanChangeLineBody, PLAN_CHANGE_CHAT_LINE } from '@cp/domain';
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';

import { firstName } from '../data/use-typing';

/** "Bà Nà Hills, Wed 21 Oct, 07:00" from a plan change line's body; '' when it names nothing. */
function planChange(body: string, locale: string): string {
  const parsed = parsePlanChangeLineBody(body);
  if (parsed === null) return '';
  const day =
    parsed.date === null
      ? null
      : // Midday UTC keeps the calendar date in every zone.
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a date literal and Intl options.
        format.date(locale, new Date(`${parsed.date}T12:00:00Z`), {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        });
  return [parsed.title, day, parsed.time].filter((part) => part !== null && part !== '').join(', ');
}

export function systemLine(
  refKind: string | null,
  who: string | null | undefined,
  body: string,
  locale = 'en',
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
    case PLAN_CHANGE_CHAT_LINE.added: {
      const change = planChange(body, locale);
      return change === ''
        ? t({ id: 'chat.system.planChanged', message: 'The crew said yes. The plan changed.' })
        : t({
            id: 'chat.system.planAdded',
            message: `The crew said yes: ${change} is in the plan`,
          });
    }
    case PLAN_CHANGE_CHAT_LINE.changed: {
      const change = planChange(body, locale);
      return change === ''
        ? t({ id: 'chat.system.planChanged', message: 'The crew said yes. The plan changed.' })
        : t({
            id: 'chat.system.planChangedTo',
            message: `The crew said yes: the plan now has ${change}`,
          });
    }
    case PLAN_CHANGE_CHAT_LINE.kept: {
      const change = planChange(body, locale);
      return change === ''
        ? t({ id: 'chat.system.planKept', message: 'The crew said no. The plan stays as it was.' })
        : t({
            id: 'chat.system.planKeptOne',
            message: `The crew said no to ${change}. The plan stays as it was.`,
          });
    }
    case 'idea_saved':
      return body === ''
        ? t({ id: 'chat.system.ideaSavedPlain', message: `${name} saved a place to Ideas` })
        : t({ id: 'chat.system.ideaSaved', message: `${name} saved ${body} to Ideas` });
    case PLAN_CHANGE_CHAT_LINE.editAdded:
      return t({
        id: 'chat.system.planEditAdded',
        message: `${name} added ${planChange(body, locale)}`,
      });
    case PLAN_CHANGE_CHAT_LINE.editMoved:
      return t({
        id: 'chat.system.planEditMoved',
        message: `${name} moved ${planChange(body, locale)}`,
      });
    case PLAN_CHANGE_CHAT_LINE.editRemoved:
      return t({
        id: 'chat.system.planEditRemoved',
        message: `${name} dropped ${planChange(body, locale)}`,
      });
    case PLAN_CHANGE_CHAT_LINE.edited:
      return t({ id: 'chat.system.planEdited', message: `${name} changed the plan` });
    case PLAN_CHANGE_CHAT_LINE.ranOut:
      return t({
        id: 'chat.system.planVoteRanOut',
        message: 'The vote ran out. The plan stays as it was.',
      });
    case null:
    default:
      return body;
  }
}
