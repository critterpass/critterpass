/**
 * Reply intent (route `rsvp.reply_intent`, a Jev choice decision with a fast-tier twin): a free-text
 * reply to a proposal notification or chat is read as in, maybe, out or a question. Nothing is
 * applied from it: an `out` only shows the sender the confirm card ("Sounds like you're out — tell
 * the crew?"), and only their confirm (`decline_trip`) starts the dropout.
 */
import { decisionBand, isConfident } from '@cp/domain';

import type { DecisionClient } from '../../decide/client';
import type { UsageContext } from '../../usage';

export const INTENT_ROUTE = 'rsvp.reply_intent' as const;

export const INTENT_QUESTIONS = {
  intent: {
    type: 'choice',
    instructions:
      'A crew member was sent a trip proposal and asked whether they are in. The state is their written reply. What did they answer?',
    criteria: {
      in: 'They are coming: yes, count me in, booked, cannot wait.',
      maybe: 'They are not sure yet or need to check something first.',
      out: 'They are not coming: no, cannot make it, drop me, pass.',
      question: 'Neither: a question about the trip, a joke, or something unrelated.',
    },
  },
} as const;

export type RsvpIntent = 'in' | 'maybe' | 'out' | 'question';

/** The reply's intent, or `null` when the model is not confident enough to suggest anything. */
export async function readRsvpIntent(
  decisions: Pick<DecisionClient, 'decide'>,
  text: string,
  context: UsageContext = {},
): Promise<RsvpIntent | null> {
  const decision = await decisions.decide(
    INTENT_ROUTE,
    { state: { reply: text.slice(0, 500) }, questions: INTENT_QUESTIONS },
    context,
  );
  const answer = decision.answers.intent;
  const band = decisionBand(INTENT_ROUTE, decision.answered_by);
  if (!isConfident(answer.confidence, band)) return null;
  return answer.choice;
}
