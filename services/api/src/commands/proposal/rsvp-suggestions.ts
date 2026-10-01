/**
 * `execute_rsvp_suggestion` / `dismiss_rsvp_suggestion` (docs/api-contracts.md §4.7): the
 * organiser acts on a guide suggestion on the tracker. RESEND schedules the resend at the
 * recipient's local hour with the chosen lead item; an offer publishes the anonymised option.
 * A handled suggestion leaves the tracker.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, rsvpSuggestionPayloadSchema } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { publishOffer, requireAnonymousCrew } from './offers';
import { loadProposal, type ProposalRow } from './shared';

interface SuggestionRow {
  readonly id: string;
  readonly proposal_id: string;
  readonly kind: 'resend' | 'offer' | 'nudge';
  readonly target_uid: string | null;
  readonly payload: Record<string, unknown>;
  readonly status: string;
}

const resendPayload = z.object({
  due_at: z.iso.datetime({ offset: true }),
  lead_item_id: z.uuid().nullish(),
});
const offerPayload = z.object({
  option: z.object({ kind: z.enum(['cheaper_room', 'skip_day', 'cheaper_stay']), id: z.string() }),
});

/** An open suggestion on a proposal the caller organises (RLS: organisers only). */
async function openSuggestion(
  tx: pg.PoolClient,
  suggestionId: string,
): Promise<{ suggestion: SuggestionRow; proposal: ProposalRow }> {
  const { rows } = await tx.query<SuggestionRow>(
    `SELECT id, proposal_id, kind, target_uid, payload, status FROM rsvp_suggestions
      WHERE id = $1`,
    [suggestionId],
  );
  const suggestion = rows[0];
  if (suggestion === undefined) throw new DomainError('NOT_FOUND', { reason: 'suggestion' });
  if (suggestion.status !== 'open')
    throw new DomainError('STATE_INVALID', { state: suggestion.status });
  return { suggestion, proposal: await loadProposal(tx, suggestion.proposal_id) };
}

async function settle(
  tx: pg.PoolClient,
  proposal: ProposalRow,
  suggestionId: string,
  status: 'executed' | 'dismissed',
  actorUid: string,
): Promise<void> {
  await asSystemRole(tx, () =>
    tx.query('UPDATE rsvp_suggestions SET status = $2 WHERE id = $1', [suggestionId, status]),
  );
  await appendDomainEvent(tx, {
    type: status === 'executed' ? 'suggestion.executed' : 'suggestion.dismissed',
    aggregateKind: 'rsvp_suggestion',
    aggregateId: suggestionId,
    actorKind: 'user',
    actorId: actorUid,
    payload: { trip_id: proposal.trip_id, proposal_id: proposal.id, suggestion_id: suggestionId },
    crewId: proposal.crew_id,
    tripId: proposal.trip_id,
  });
}

export const executeRsvpSuggestionCommand = defineCommand({
  name: 'execute_rsvp_suggestion',
  v: 1,
  schema: rsvpSuggestionPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await openSuggestion(tx, payload.suggestion_id);
  },
  handle: async (tx, payload, ctx) => {
    const { suggestion, proposal } = await openSuggestion(tx, payload.suggestion_id);
    if (suggestion.kind === 'resend' && suggestion.target_uid !== null) {
      const resend = resendPayload.parse(suggestion.payload);
      await asSystemRole(tx, () =>
        tx.query(
          `INSERT INTO proposal_followups (proposal_id, trip_id, user_id, kind, due_at, lead_item_id)
           VALUES ($1, $2, $3, 'resend', $4, $5)
           ON CONFLICT (proposal_id, user_id, kind) WHERE status = 'scheduled'
           DO UPDATE SET due_at = EXCLUDED.due_at, lead_item_id = EXCLUDED.lead_item_id`,
          [
            proposal.id,
            proposal.trip_id,
            suggestion.target_uid,
            resend.due_at,
            resend.lead_item_id ?? null,
          ],
        ),
      );
    } else if (suggestion.kind === 'offer') {
      await requireAnonymousCrew(tx, proposal.trip_id);
      await publishOffer(tx, proposal, offerPayload.parse(suggestion.payload).option, ctx.uid);
    }
    await settle(tx, proposal, suggestion.id, 'executed', ctx.uid);
    return { suggestion_id: suggestion.id, status: 'executed' };
  },
});

export const dismissRsvpSuggestionCommand = defineCommand({
  name: 'dismiss_rsvp_suggestion',
  v: 1,
  schema: rsvpSuggestionPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await openSuggestion(tx, payload.suggestion_id);
  },
  handle: async (tx, payload, ctx) => {
    const { suggestion, proposal } = await openSuggestion(tx, payload.suggestion_id);
    await settle(tx, proposal, suggestion.id, 'dismissed', ctx.uid);
    return { suggestion_id: suggestion.id, status: 'dismissed' };
  },
});
