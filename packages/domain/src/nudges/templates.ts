/**
 * The guide-voiced nudge copy (notification N-12 and the share-sheet relay). Templates carry a
 * catalog id and the source message; the worker renders the push in the target's language and
 * the app renders the relay in the sender's. Every line says who it is from.
 */
import type { NudgeReason } from '../home/events';

export interface NudgeCopy {
  readonly id: string;
  readonly message: string;
}

export const NUDGE_PUSH_TITLE: NudgeCopy = /*i18n*/ {
  id: 'notifications.nudge.title',
  message: '{guide}, with a nudge from {sender}',
};

export const NUDGE_PUSH_BODY: Readonly<Record<NudgeReason, NudgeCopy>> = {
  vote: /*i18n*/ {
    id: 'notifications.nudge.vote',
    message: "{crew} is waiting on your vote. It takes a tap, and I'll do the counting.",
  },
  rsvp: /*i18n*/ {
    id: 'notifications.nudge.rsvp',
    message: "{crew} wants to know if you're in. Yes, no or maybe all help.",
  },
  readiness: /*i18n*/ {
    id: 'notifications.nudge.readiness',
    message: "{crew} is getting ready to leave. Tell them where you're at.",
  },
  payment: /*i18n*/ {
    id: 'notifications.nudge.payment',
    message: "There's a settle-up waiting for you in {crew}. Two taps and you're square.",
  },
  invite_open: /*i18n*/ {
    id: 'notifications.nudge.invite_open',
    message: '{crew} is still saving you a spot. Have a look when you can.',
  },
};

/** The relay text the sender shares from their own phone, when the target has no app yet. */
export function nudgeRelayText(input: {
  readonly guide: string;
  readonly sender: string;
  readonly crew: string;
  readonly url: string | null;
}): string {
  const line = `${input.sender} and ${input.guide} are saving you a spot in ${input.crew} on CritterPass.`;
  return input.url === null ? line : `${line} ${input.url}`;
}
