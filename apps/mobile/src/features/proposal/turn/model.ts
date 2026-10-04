/**
 * Whose turn it is on a trip the crew is still agreeing on, by the trip's status and the viewer's
 * role: one state and at most one next step. Home's trip card and the hub's main button both read
 * it, so the two never disagree. The organiser drafts, sends and locks; a member waits for the
 * plan, answers it, then waits for the lock.
 */
/* eslint-disable lingui/no-unlocalized-strings -- statuses and wire values, never copy. */
import type { CrewPerson, RsvpStatus } from '../data/trip';

export type TurnRole = 'organiser' | 'member';

/** Where the step's one button leads. */
export type TurnTarget = 'setup' | 'drafting' | 'draft' | 'builder' | 'proposal' | 'tracker';

export type Answer = 'in' | 'maybe' | 'out' | 'waitlisted';

export type Turn =
  | { readonly kind: 'vote' }
  | { readonly kind: 'setup' }
  /** The guide is writing (or rewriting) the organiser's draft. */
  | { readonly kind: 'guide_drafting' }
  /** The organiser's private draft is ready and there is nobody to send it to yet. */
  | { readonly kind: 'finish_draft' }
  /** The draft is ready and `waiting` friends have not seen a plan. */
  | { readonly kind: 'send_plan'; readonly waiting: number }
  /** A member before anything is sent. */
  | { readonly kind: 'plan_coming' }
  | { readonly kind: 'answer'; readonly replyBy: string | null }
  | { readonly kind: 'answered'; readonly answer: Answer; readonly replyBy: string | null }
  | {
      readonly kind: 'waiting_for_answers';
      readonly answered: number;
      readonly total: number;
      readonly replyBy: string | null;
    }
  /** Everyone has answered (or everyone is out): the organiser can lock. */
  | { readonly kind: 'lock'; readonly going: number; readonly crew: number }
  | { readonly kind: 'locked' }
  | { readonly kind: 'none' };

export interface TripTurn {
  readonly turn: Turn;
  /** The step is the viewer's to take (the button leads; otherwise they are waiting). */
  readonly mine: boolean;
  readonly target: TurnTarget | null;
}

export interface TurnInput {
  readonly status: string;
  readonly role: TurnRole;
  /** Active crew members, the viewer included. */
  readonly crewSize: number;
  /** The trip's live proposal as synced; null when none is on the phone. */
  readonly proposal: { readonly status: string; readonly replyBy: string | null } | null;
  readonly myRsvp: RsvpStatus | null;
  /** Everyone the proposal went to (the crew other than the viewer). */
  readonly recipients: readonly Pick<CrewPerson, 'rsvp'>[];
}

const LOCKED = new Set(['confirmed', 'pre_trip', 'in_trip', 'post_trip', 'archived']);
const ANSWERS: readonly string[] = ['in', 'maybe', 'out', 'waitlisted'];

/** The trip is confirmed or further along: the countdown may start. */
export function isLockedIn(status: string): boolean {
  return LOCKED.has(status);
}

function answerOf(rsvp: RsvpStatus | null): Answer | null {
  return rsvp !== null && ANSWERS.includes(rsvp) ? (rsvp as Answer) : null;
}

const step = (turn: Turn, mine: boolean, target: TurnTarget | null): TripTurn => ({
  turn,
  mine,
  target,
});

function proposed(input: TurnInput): TripTurn {
  const replyBy = input.proposal?.replyBy ?? null;
  if (input.role === 'member') {
    const answer = answerOf(input.myRsvp);
    return answer === null
      ? step({ kind: 'answer', replyBy }, true, 'proposal')
      : step({ kind: 'answered', answer, replyBy }, false, 'proposal');
  }
  const total = input.recipients.length;
  const answered = input.recipients.filter((p) => answerOf(p.rsvp) !== null).length;
  const going = input.recipients.filter((p) => p.rsvp === 'in').length;
  const everyoneOut = total > 0 && input.recipients.every((p) => p.rsvp === 'out');
  // The server refuses a lock with nobody in, unless every recipient said they can't make it.
  if (total > 0 && answered === total && (going > 0 || everyoneOut)) {
    return step({ kind: 'lock', going: going + 1, crew: total + 1 }, true, 'tracker');
  }
  return step({ kind: 'waiting_for_answers', answered, total, replyBy }, false, 'tracker');
}

export function tripTurn(input: TurnInput): TripTurn {
  const organiser = input.role === 'organiser';
  switch (input.status) {
    case 'voting':
      return step({ kind: 'vote' }, true, null);
    case 'won':
    case 'setup':
      return step({ kind: 'setup' }, true, 'setup');
    case 'drafting':
      return organiser
        ? step({ kind: 'guide_drafting' }, false, 'drafting')
        : step({ kind: 'plan_coming' }, false, null);
    case 'redrafting':
      return organiser
        ? step({ kind: 'guide_drafting' }, false, 'draft')
        : step({ kind: 'plan_coming' }, false, null);
    case 'draft_review': {
      if (!organiser) return step({ kind: 'plan_coming' }, false, null);
      const waiting = Math.max(0, input.crewSize - 1);
      if (waiting === 0) return step({ kind: 'finish_draft' }, true, 'draft');
      // A proposal already being built is where she left off; otherwise the draft she sends from.
      const building = input.proposal?.status === 'building';
      return step({ kind: 'send_plan', waiting }, true, building ? 'builder' : 'draft');
    }
    case 'proposed':
      return proposed(input);
    default:
      return isLockedIn(input.status)
        ? step({ kind: 'locked' }, false, null)
        : step({ kind: 'none' }, false, null);
  }
}
