/**
 * The words for whose turn it is: one line saying where the trip stands for this person, and the
 * label of the one button that takes the next step (none while they are waiting on someone else
 * with nothing to open).
 */
import { plural, t } from '@lingui/core/macro';

import { instantDate } from '../data/format';
import type { SetupStep, Turn } from './model';

export interface TurnCopy {
  readonly line: string;
  readonly button: string | null;
}

export interface TurnNames {
  readonly locale: string;
  /** The trip's guide ("Chà Vá"). */
  readonly guide: string;
  /** The organiser's first name; empty when it is not on the phone. */
  readonly organiser: string;
}

function answerLine(turn: Extract<Turn, { kind: 'answer' }>, names: TurnNames): string {
  const { organiser } = names;
  const date = turn.replyBy === null ? '' : instantDate(names.locale, turn.replyBy);
  if (organiser === '') {
    return date === ''
      ? t({ id: 'proposal.turn.answer.plain', message: 'The plan is here. Are you in?' })
      : t({
          id: 'proposal.turn.answer.plainBy',
          message: `The plan is here. Answer by ${date}.`,
        });
  }
  return date === ''
    ? t({ id: 'proposal.turn.answer.from', message: `${organiser} sent the plan. Are you in?` })
    : t({
        id: 'proposal.turn.answer.fromBy',
        message: `${organiser} sent the plan. Answer by ${date}.`,
      });
}

function answeredCopy(turn: Extract<Turn, { kind: 'answered' }>, names: TurnNames): TurnCopy {
  const { organiser } = names;
  const change = t({ id: 'proposal.turn.answered.change', message: 'Change your answer' });
  switch (turn.answer) {
    case 'in':
      return {
        line:
          organiser === ''
            ? t({
                id: 'proposal.turn.answered.inPlain',
                message: "You're in. The trip is confirmed once it's locked.",
              })
            : t({
                id: 'proposal.turn.answered.in',
                message: `You're in. Waiting for ${organiser} to lock the trip.`,
              }),
        button: t({ id: 'proposal.turn.answered.version', message: 'See your version' }),
      };
    case 'maybe':
      return {
        line: t({
          id: 'proposal.turn.answered.maybe',
          message: 'You said maybe. Say yes or no before the trip is locked.',
        }),
        button: change,
      };
    case 'out':
      return {
        line: t({ id: 'proposal.turn.answered.out', message: "You said you can't make it." }),
        button: change,
      };
    case 'waitlisted':
      return {
        line: t({
          id: 'proposal.turn.answered.waitlisted',
          message: "The trip is full. You're in line for a seat.",
        }),
        button: t({ id: 'proposal.turn.answered.version', message: 'See your version' }),
      };
  }
}

/** "Budget, rooms and must-dos come next." naming the set-up steps still to do. */
function setupLine(left: readonly SetupStep[], locale: string): string {
  const words = left.map((step) => {
    switch (step) {
      case 'when':
        return t({ id: 'proposal.turn.setup.when', message: 'dates' });
      case 'budget':
        return t({ id: 'proposal.turn.setup.budget', message: 'budget' });
      case 'rooms':
        return t({ id: 'proposal.turn.setup.rooms', message: 'rooms' });
      case 'must_dos':
        return t({ id: 'proposal.turn.setup.mustDos', message: 'must-dos' });
    }
  });
  if (words.length === 0) {
    return t({
      id: 'proposal.turn.setup.ready',
      message: 'Set-up is done. The guide drafts next.',
    });
  }
  const list = new Intl.ListFormat(locale, { type: 'conjunction' }).format(words);
  return t({ id: 'proposal.turn.setup.left', message: `Still to set up: ${list}.` });
}

export function turnCopy(turn: Turn, names: TurnNames): TurnCopy {
  const { guide, organiser } = names;
  switch (turn.kind) {
    case 'vote':
      return {
        line: t({ id: 'proposal.turn.vote', message: 'The crew is picking a place.' }),
        button: null,
      };
    case 'setup':
      return {
        line: setupLine(turn.left, names.locale),
        button: t({ id: 'proposal.turn.setup.button', message: 'Set up the trip' }),
      };
    case 'guide_drafting':
      return {
        line: t({ id: 'proposal.turn.drafting', message: `${guide} is drafting your trip.` }),
        button: t({ id: 'proposal.turn.drafting.button', message: 'See the draft' }),
      };
    case 'finish_draft':
      return {
        line: t({
          id: 'proposal.turn.finishDraft',
          message: 'Your draft is ready. Only you see it until you send it.',
        }),
        button: t({ id: 'proposal.turn.finishDraft.button', message: 'Finish the draft' }),
      };
    case 'send_plan': {
      const { waiting } = turn;
      return {
        line: t({
          id: 'proposal.turn.sendPlan',
          message: plural(waiting, {
            one: 'Your draft is ready. # friend is waiting for the plan.',
            other: 'Your draft is ready. # friends are waiting for the plan.',
          }),
        }),
        button: t({ id: 'proposal.turn.sendPlan.button', message: 'Send the plan' }),
      };
    }
    case 'plan_coming':
      return {
        line:
          organiser === ''
            ? t({
                id: 'proposal.turn.planComing.plain',
                message: "The plan is still being worked on. You'll get it here.",
              })
            : t({
                id: 'proposal.turn.planComing',
                message: `${organiser} is still working on the plan. You'll get it here.`,
              }),
        button: null,
      };
    case 'answer':
      return {
        line: answerLine(turn, names),
        button: t({ id: 'proposal.turn.answer.button', message: 'Read it and answer' }),
      };
    case 'answered':
      return answeredCopy(turn, names);
    case 'waiting_for_answers': {
      const { answered, total } = turn;
      if (turn.going === 0 && turn.maybeNames.length > 0) {
        const who = new Intl.ListFormat(names.locale, { type: 'conjunction' }).format(
          turn.maybeNames,
        );
        return {
          line: t({
            id: 'proposal.turn.waitingMaybe',
            message: `${who} said maybe. Nobody is in yet.`,
          }),
          button: t({ id: 'proposal.turn.waiting.button', message: "Who's in?" }),
        };
      }
      const date = turn.replyBy === null ? '' : instantDate(names.locale, turn.replyBy);
      return {
        line:
          date === ''
            ? t({
                id: 'proposal.turn.waiting',
                message: `The plan is out. ${answered} of ${total} answered.`,
              })
            : t({
                id: 'proposal.turn.waitingBy',
                message: `The plan is out. ${answered} of ${total} answered, replies by ${date}.`,
              }),
        button: t({ id: 'proposal.turn.waiting.button', message: "Who's in?" }),
      };
    }
    case 'lock': {
      const { going, crew } = turn;
      return {
        line: t({
          id: 'proposal.turn.lock',
          message: `Replies are in: ${going} of ${crew} going. Lock the trip to confirm it.`,
        }),
        button: t({ id: 'proposal.turn.lock.button', message: 'Lock it in' }),
      };
    }
    case 'locked':
      return {
        line: t({ id: 'proposal.turn.lockedIn', message: 'Locked in. The trip is confirmed.' }),
        button: null,
      };
    case 'plan_vote': {
      const { by } = turn;
      return {
        line:
          by === ''
            ? t({
                id: 'proposal.turn.planVote.plain',
                message: 'A change to the plan is waiting for your yes.',
              })
            : t({
                id: 'proposal.turn.planVote',
                message: `${by} wants to change the plan. It waits for your yes.`,
              }),
        button: t({ id: 'proposal.turn.planVote.button', message: 'See the change' }),
      };
    }
    case 'ideas_waiting': {
      const { count } = turn;
      return {
        line: t({
          id: 'proposal.turn.ideasWaiting',
          message: plural(count, {
            one: 'The crew saved # place to Ideas. It waits for you to put it in a day.',
            other: 'The crew saved # places to Ideas. They wait for you to put them in a day.',
          }),
        }),
        button: t({ id: 'proposal.turn.ideasWaiting.button', message: 'See Ideas' }),
      };
    }
    case 'none':
      return { line: '', button: null };
  }
}
