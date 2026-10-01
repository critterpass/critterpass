/**
 * `ai.rsvp_intent`: reads a free-text reply to a proposal as in, maybe, out or a question and
 * answers the sender alone, on their own channel. An "out" becomes the confirm card ("Sounds like
 * you're out — tell the crew?"); this job never changes an RSVP and never queues the dropout,
 * which only the sender's confirm (`decline_trip`) can start.
 */
import { readRsvpIntent, type DecisionClient, type RsvpIntent } from '@cp/ai';
import { outbox, withSystem } from '@cp/db';
import { PROPOSAL_QUEUES, userChannel } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export const RSVP_INTENT_EVENT = 'rsvp.intent';

export type IntentReader = (text: string, userId: string) => Promise<RsvpIntent | null>;

export function decisionIntentReader(decisions: Pick<DecisionClient, 'decide'>): IntentReader {
  return (text, userId) => readRsvpIntent(decisions, text, { userId });
}

export async function runRsvpIntent(
  pool: pg.Pool,
  read: IntentReader | undefined,
  input: { proposal_id: string; user_id: string; text: string },
): Promise<{ intent: RsvpIntent | null; card: 'confirm_out' | 'suggest_reply' | null }> {
  const intent = read === undefined ? null : await read(input.text, input.user_id);
  const card =
    intent === 'out'
      ? 'confirm_out'
      : intent === 'in' || intent === 'maybe'
        ? 'suggest_reply'
        : null;
  await withSystem(pool, (tx) =>
    outbox(tx, userChannel(input.user_id), RSVP_INTENT_EVENT, {
      proposal_id: input.proposal_id,
      intent,
      card,
    }),
  );
  return { intent, card };
}

export function rsvpIntentJob(read: IntentReader | undefined): AnyJobDefinition {
  return defineJob({
    queue: PROPOSAL_QUEUES.rsvpIntent,
    schema: z.object({
      proposal_id: z.uuid(),
      user_id: z.uuid(),
      text: z.string().min(1).max(500),
    }),
    async handler(data, { pool }) {
      return { ...(await runRsvpIntent(pool, read, data)) };
    },
  });
}
