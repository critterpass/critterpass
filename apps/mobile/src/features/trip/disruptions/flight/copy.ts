/**
 * The flight-delayed screen's words (3k-5), read in the active language at render. A row's line is
 * the guide's own when the app reads the language the guide writes in; in any other language it
 * is built here from the row's facts, so every time and name on screen is still the server's.
 */
import { format, upper } from '@cp/i18n';
import type { DisruptionAction } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';

import type { FlightCause } from './model';

const SOURCE_LANGUAGE = 'en';

const fact = (action: DisruptionAction, key: string): string => {
  const value = action.facts[key];
  return value === undefined ? '' : String(value);
};

/** "SQ938 · SIN → DPS · Mon 12 Oct". */
export function flightEyebrow(
  input: { flight: string; from: string | null; to: string | null; departs: Date | null },
  locale: string,
): string {
  const parts = [input.flight];
  if (input.from !== null && input.to !== null) parts.push(`${input.from} → ${input.to}`);
  if (input.departs !== null) {
    parts.push(
      format.date(locale, input.departs, { weekday: 'short', day: 'numeric', month: 'short' }),
    );
  }
  return upper(parts.join(' · '), locale);
}

/** The hero's two lines: what happened, then by how much. */
export function heroLines(
  cause: FlightCause,
  delay: { hours: number; minutes: number } | null,
  locale: string,
): readonly [string, string | null] {
  switch (cause) {
    case 'cancelled':
      return [
        upper(t({ id: 'trip.disruptions.flight.cancelled', message: 'Cancelled' }), locale),
        null,
      ];
    case 'diverted':
      return [
        upper(t({ id: 'trip.disruptions.flight.diverted', message: 'Diverted' }), locale),
        null,
      ];
    case 'missed_connection':
      return [
        upper(t({ id: 'trip.disruptions.flight.missed', message: 'Connection missed' }), locale),
        null,
      ];
    case 'delay': {
      const title = upper(t({ id: 'trip.disruptions.flight.delayed', message: 'Delayed' }), locale);
      if (delay === null) return [title, null];
      const { hours, minutes } = delay;
      const amount =
        hours === 0
          ? t({ id: 'trip.disruptions.flight.delayMinutes', message: `${minutes}m` })
          : minutes === 0
            ? t({ id: 'trip.disruptions.flight.delayHours', message: `${hours}h` })
            : t({ id: 'trip.disruptions.flight.delayBoth', message: `${hours}h ${minutes}m` });
      return [title, upper(amount, locale)];
    }
  }
}

export const sectionTitles = () => ({
  done: t({ id: 'trip.disruptions.flight.done', message: 'Already done' }),
  working: t({ id: 'trip.disruptions.flight.working', message: 'On its way' }),
  question: t({ id: 'trip.disruptions.flight.needsYes', message: 'Needs a yes' }),
  problem: t({ id: 'trip.disruptions.flight.problem', message: 'Needs a look' }),
});

function vendorLine(action: DisruptionAction): string {
  const vendor = fact(action, 'vendor');
  const to = fact(action, 'to');
  switch (action.state) {
    case 'draft_ready':
    case 'needs_yes':
      return to === ''
        ? t({
            id: 'trip.disruptions.flight.row.vendorCancel',
            message: `Tell ${vendor} the flight won't land today?`,
          })
        : t({ id: 'trip.disruptions.flight.row.vendorAsk', message: `Ask ${vendor} for ${to}?` });
    case 'approved':
    case 'sent':
      return t({
        id: 'trip.disruptions.flight.row.vendorSent',
        message: `Message ready for ${vendor}`,
      });
    case 'confirmed':
      return t({
        id: 'trip.disruptions.flight.row.vendorConfirmed',
        message: `${vendor} confirmed ${to}`,
      });
    case 'declined':
      return t({ id: 'trip.disruptions.flight.row.vendorDeclined', message: `${vendor} said no` });
    case 'no_answer':
      return t({
        id: 'trip.disruptions.flight.row.vendorNoAnswer',
        message: `No answer from ${vendor}. Call them?`,
      });
    case 'planned':
    case 'running':
    case 'done':
    case 'failed':
    case 'undone':
    case 'kept':
    case 'waiting_vendor':
    case 'withdrawn':
    case 'link':
      return vendor;
  }
}

/** A row's line from its facts, in the active language. */
export function templateLine(action: DisruptionAction): string {
  const title = fact(action, 'title');
  const from = fact(action, 'from');
  const to = fact(action, 'to');
  switch (action.kind) {
    case 'retime_item':
      return t({ id: 'trip.disruptions.flight.row.retime', message: `${title} ${from} → ${to}` });
    case 'reschedule_pickup':
      return t({ id: 'trip.disruptions.flight.row.pickup', message: `Pickup ${from} → ${to}` });
    case 'skip_item':
      return t({ id: 'trip.disruptions.flight.row.skip', message: `${title} off the plan` });
    case 'recompute_leave_by':
      return t({ id: 'trip.disruptions.flight.row.leaveBy', message: 'Leave-by times updated' });
    case 'refresh_live_activity':
      return t({
        id: 'trip.disruptions.flight.row.liveActivity',
        message: 'Flight updated on your lock screen',
      });
    case 'insert_briefing':
      return t({ id: 'trip.disruptions.flight.row.briefing', message: 'Added to your briefing' });
    case 'notify_unaffected':
      return t({
        id: 'trip.disruptions.flight.row.unaffected',
        message: 'Told the others nothing changes for them',
      });
    case 'contact_vendor':
      return vendorLine(action);
    case 'rebook_flight': {
      const carrier = fact(action, 'carrier');
      return t({ id: 'trip.disruptions.flight.row.rebook', message: `Rebook on ${carrier}` });
    }
  }
}

/** The guide's words in its own language; the facts' template in any other. */
export function rowLine(action: DisruptionAction, locale: string): string {
  const own = locale.split(/[-_]/u)[0] === SOURCE_LANGUAGE;
  // A vendor row's state moves after the guide worded it: only the state's own line is true.
  const vendorMoved = action.kind === 'contact_vendor' && action.state !== 'draft_ready';
  return own && !vendorMoved && action.label !== '' ? action.label : templateLine(action);
}

/** The question card's heading: "DINNER: 19:30 → 21:00". */
export function questionHeading(action: DisruptionAction, locale: string): string {
  const title = fact(action, 'title') || fact(action, 'vendor');
  const from = fact(action, 'from');
  const to = fact(action, 'to');
  const line =
    to === ''
      ? title
      : t({ id: 'trip.disruptions.flight.question', message: `${title}: ${from} → ${to}` });
  return upper(line, locale);
}

export const actionLabels = (from: string) => ({
  approve: t({ id: 'trip.disruptions.flight.approve', message: 'Approve' }),
  keep:
    from === ''
      ? t({ id: 'trip.disruptions.flight.keepPlan', message: 'Keep the plan' })
      : t({ id: 'trip.disruptions.flight.keep', message: `Keep ${from}` }),
});

export function affectedCount(count: number): string {
  return t({
    id: 'trip.disruptions.flight.affected',
    message: plural(count, { one: '# affected', other: '# affected' }),
  });
}

export function decidedLine(name: string, approved: boolean, from: string): string {
  return approved
    ? t({ id: 'trip.disruptions.flight.approvedBy', message: `${name} approved` })
    : from === ''
      ? t({ id: 'trip.disruptions.flight.keptBy', message: `${name} kept the plan` })
      : t({ id: 'trip.disruptions.flight.keptFromBy', message: `${name} kept ${from}` });
}

export function waitingOn(names: readonly string[], locale: string): string {
  const list = format.list(locale, [...names], { type: 'conjunction' });
  return t({ id: 'trip.disruptions.flight.waitingOn', message: `Waiting on ${list}` });
}

export function answerBy(time: string): string {
  return t({ id: 'trip.disruptions.flight.answerBy', message: `Answer by ${time}` });
}

export const footerLabels = () => ({
  tell: t({ id: 'trip.disruptions.flight.tellCrew', message: 'Tell the crew' }),
  undo: t({ id: 'trip.disruptions.flight.undoAll', message: 'Undo everything' }),
});

export function toastLines(guide: string) {
  return {
    told: t({ id: 'trip.disruptions.flight.toldCrew', message: 'Posted in crew chat.' }),
    undone: t({ id: 'trip.disruptions.flight.undid', message: `Undid ${guide}'s changes.` }),
  };
}

export const stateLines = () => ({
  resolved: t({
    id: 'trip.disruptions.flight.landed',
    message: 'Landed. Everything here is settled.',
  }),
  undone: t({
    id: 'trip.disruptions.flight.undone',
    message: 'Back to the plan from before the delay.',
  }),
  offline: t({
    id: 'trip.disruptions.flight.offline',
    message: "You're offline. Answers go out when you're back.",
  }),
  missingTitle: t({ id: 'trip.disruptions.flight.missingTitle', message: 'All sorted' }),
  missing: t({ id: 'trip.disruptions.flight.missing', message: 'Nothing to sort here any more.' }),
  back: t({ id: 'trip.disruptions.flight.back', message: 'Back' }),
  backTo: t({ id: 'trip.disruptions.flight.backTo', message: 'Trip' }),
});
