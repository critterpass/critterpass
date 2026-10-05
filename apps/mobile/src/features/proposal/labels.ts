/**
 * The lines the proposal screens build from data: prices, dates, deadlines and who did what. The
 * screens and the (dev) lab scenes both read them from here, so a lab capture in any language
 * shows the copy and the formatting the real screens use.
 */
import { t } from '@lingui/core/macro';

import {
  clock,
  dayRange,
  instantDate,
  instantDateTime,
  signedMoney,
  wholeMoney,
} from './data/format';
import type { CrewPerson } from './data/trip';
import { publicStatus, type LockState } from './tracker/model';

/** "$1,310 each", or null before the trip is priced. */
export function eachPrice(
  locale: string,
  shareMinor: number | null,
  currency: string | null,
): string | null {
  if (shareMinor === null || currency === null) return null;
  const amount = wholeMoney(locale, shareMinor, currency);
  return t({ id: 'proposal.build.eachAmount', message: `${amount} each` });
}

/** "Nov 5–11", or '' while the dates are open. */
export function tripDates(locale: string, start: string | null, end: string | null): string {
  return start && end ? dayRange(locale, start, end) : '';
}

/** "Lisbon · Nov 5–11". */
export function tripLine(
  locale: string,
  destination: string,
  start: string | null,
  end: string | null,
): string {
  return [destination, tripDates(locale, start, end)].filter(Boolean).join(' · ');
}

/** "Day 1 · 17:00" for a plan stop; '' when it has no day. */
export function stopWhen(
  locale: string,
  stop: {
    readonly dayNo: number | null;
    readonly startsAt: string | null;
    readonly tz: string | null;
  },
): string {
  if (stop.dayNo === null) return '';
  const day = t({ id: 'proposal.version.day', message: `Day ${stop.dayNo}` });
  return stop.startsAt === null ? day : `${day} · ${clock(locale, stop.startsAt, stop.tz)}`;
}

/** The chip on a member's version once they have answered: their answer, in place of the date. */
export function answerChip(answer: 'in' | 'maybe' | 'out' | 'waitlisted'): string {
  switch (answer) {
    case 'in':
      return t({ id: 'proposal.version.chip.in', message: 'You’re in' });
    case 'maybe':
      return t({ id: 'proposal.version.chip.maybe', message: 'You said maybe' });
    case 'out':
      return t({ id: 'proposal.version.chip.out', message: 'Can’t make it' });
    case 'waitlisted':
      return t({ id: 'proposal.version.chip.waitlisted', message: 'On the waitlist' });
  }
}

/** The deadline chip on a member's version. */
export function versionChip(
  locale: string,
  freeCancelUntil: string | null,
  replyBy: string | null,
): string | null {
  if (freeCancelUntil !== null) {
    return t({
      id: 'proposal.version.freeCancel',
      message: `Free cancel till ${instantDate(locale, freeCancelUntil)}`,
    });
  }
  if (replyBy === null) return null;
  return t({ id: 'proposal.version.replyBy', message: `Reply by ${instantDate(locale, replyBy)}` });
}

/** The tracker's way back: "{place} proposal". */
export function trackerBack(trip: { readonly destination: string }): string {
  return t({ id: 'proposal.tracker.back', message: `${trip.destination} proposal` });
}

/** The chip on the organiser's tracker: confirmed, or the deadline the crew answers by. */
export function trackerChip(
  locale: string,
  locked: boolean,
  freeCancelUntil: string | null,
  replyBy: string | null,
): string | null {
  if (locked) return t({ id: 'proposal.tracker.confirmed', message: 'Confirmed' });
  if (freeCancelUntil !== null) {
    return t({
      id: 'proposal.tracker.freeCancel',
      message: `Free cancel till ${instantDate(locale, freeCancelUntil)}`,
    });
  }
  if (replyBy === null) return null;
  return t({ id: 'proposal.tracker.replyBy', message: `Reply by ${instantDate(locale, replyBy)}` });
}

/** A tracker row's name: the organiser reads their own as "{name} (you)". */
export function trackerName(person: { readonly name: string }, isMe: boolean): string {
  return isMe ? t({ id: 'proposal.tracker.you', message: `${person.name} (you)` }) : person.name;
}

/** What a person did with the proposal, under their name on the tracker. */
export function trackerLine(locale: string, person: CrewPerson, sentAt: string | null): string {
  const sent = (): string => {
    if (sentAt === null) return t({ id: 'proposal.tracker.notSent', message: 'Not sent yet' });
    return t({ id: 'proposal.tracker.sent', message: `Sent ${instantDate(locale, sentAt)}` });
  };
  const at = person.repliedAt === null ? '' : instantDateTime(locale, person.repliedAt);
  switch (publicStatus(person)) {
    case 'in':
      return t({ id: 'proposal.tracker.boarded', message: `Boarded ${at}` });
    case 'maybe':
      return t({ id: 'proposal.tracker.saidMaybe', message: 'Said maybe' });
    case 'out':
      return t({ id: 'proposal.tracker.cantMake', message: 'Can’t make it' });
    case 'waitlisted':
      return t({ id: 'proposal.tracker.waitlisted', message: 'On the waitlist' });
    case 'organiser':
    case 'no_reply':
      return sent();
  }
}

/** The tracker's footer: the lock button's label, or the note that stands in for it. */
export function lockCopy(state: LockState): {
  readonly label: string | null;
  readonly note: string | null;
} {
  switch (state.kind) {
    case 'ready':
      return { label: t({ id: 'proposal.lock.cta', message: 'Lock it in' }), note: null };
    case 'alone':
      return { label: t({ id: 'proposal.lock.cta', message: 'Lock it in' }), note: null };
    case 'nobody_in':
      return {
        label: null,
        note: t({
          id: 'proposal.lock.nobody',
          message: 'You can lock the trip in once someone says they’re in.',
        }),
      };
    // "The trip is on" is said once, by the locked-in card above the footer.
    case 'locked':
    case 'not_sent':
      return { label: null, note: null };
  }
}

/** "{name} told the crew they can’t make it · Oct 1, 10:05". */
export function dropoutReplyLine(locale: string, name: string, at: string): string {
  const when = instantDateTime(locale, at);
  return t({
    id: 'proposal.dropout.reply',
    message: `${name} told the crew they can’t make it · ${when}`,
  });
}

/** The organiser's share after a re-split, the share before it, and the signed difference. */
export function dropoutShare(
  locale: string,
  change: { readonly before: number; readonly after: number; readonly delta: number },
  currency: string,
): { readonly after: string; readonly before: string; readonly each: string } {
  return {
    after: wholeMoney(locale, change.after, currency),
    before: wholeMoney(locale, change.before, currency),
    each: signedMoney(locale, change.delta, currency),
  };
}

/**
 * What locking changes, for the lock sheet: who is going, what happens to a maybe and to someone
 * who never answered, and what stays possible afterwards (suggesting changes, joining later),
 * with the one thing that does not: it cannot be unlocked.
 */
export function lockConsequences(state: LockState): string[] {
  if (state.kind !== 'ready' && state.kind !== 'alone') return [];
  const after = [
    t({
      id: 'proposal.lock.stillEdit',
      message: 'The plan stays open: everyone going can still suggest changes.',
    }),
    t({
      id: 'proposal.lock.stillJoin',
      message: 'Friends who join the crew later can still take a seat.',
    }),
    t({
      id: 'proposal.lock.noUndo',
      message: 'A lock can’t be undone. Someone who drops out later frees their seat.',
    }),
  ];
  if (state.kind === 'alone') {
    return [
      t({
        id: 'proposal.lock.aloneGoing',
        message: 'Everyone else said they can’t make it, so it’s just you. The trip is confirmed.',
      }),
      ...after,
    ];
  }
  // The messages keep the placeholders their translations were written with (an expression is
  // numbered, a bare name is not): a renamed variable would blank the count in every language.
  return [
    t({
      id: 'proposal.lock.going',
      message: `${state.going + 1} going, the trip is confirmed.`,
    }),
    ...(state.maybes > 0
      ? [
          t({
            id: 'proposal.lock.maybes',
            message: `${state.maybes} maybe go on the waitlist for a freed seat.`,
          }),
        ]
      : []),
    ...(state.silent > 0
      ? [
          t({
            id: 'proposal.lock.silent',
            message: `${state.silent} who haven’t answered are out.`,
          }),
        ]
      : []),
    ...after,
  ];
}

export function lockTitle(alone = false): string {
  return alone
    ? t({ id: 'proposal.lock.titleAlone', message: 'Lock the plan in?' })
    : t({ id: 'proposal.lock.title', message: 'Lock the crew in?' });
}

export function lockConfirmLabel(): string {
  return t({ id: 'proposal.lock.confirmYes', message: 'Yes, lock it in' });
}
