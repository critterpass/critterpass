/**
 * `send_proposal` (docs/api-contracts.md §4.7): the organiser sends the built proposal. The crew
 * can see it from now on, with the plan it was built from (published as the trip's crew-visible
 * `proposed` version), the trip moves to `proposed`, each recipient gets their guide's push (N-07)
 * and the proposal's card is posted in crew chat. Sending twice changes nothing.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import { channelName, DomainError, generateUuidV7, proposalIdPayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { lockTripPlan } from '../../plan/versioning';
import { defineCommand } from '../_framework/define-command';
import { requireProposalOrganiser, type ProposalRow } from './shared';

/** The proposal's card in crew chat, posted by the organiser who sent it. */
async function postProposalCard(tx: pg.PoolClient, proposal: ProposalRow, uid: string) {
  const messageId = generateUuidV7();
  const { rows } = await tx.query<{ seq: string }>(
    `INSERT INTO messages (id, crew_id, trip_id, sender_kind, sender_id, type, body, ref_kind, ref_id)
     VALUES ($1, $2, $3, 'user', $4, 'proposal', '', 'proposal', $5) RETURNING seq`,
    [messageId, proposal.crew_id, proposal.trip_id, uid, proposal.id],
  );
  await outbox(tx, channelName('crew_chat', proposal.crew_id), 'message.created', {
    crew_id: proposal.crew_id,
    message_id: messageId,
    seq: Number(rows[0]?.seq),
  });
}

/**
 * Publishes the proposal's plan version to the crew: it becomes crew-visible and `proposed`, and
 * the trip's current version, so members read the plan they are asked about (their plan screens,
 * the guide's reader views, trip-day jobs). Only this one version is published: other organiser
 * drafts stay organiser-only. A version sent before it (a re-send after edits) is superseded.
 */
async function publishProposedPlan(tx: pg.PoolClient, proposal: ProposalRow): Promise<void> {
  if (proposal.version_id === null) return;
  const head = await lockTripPlan(tx, proposal.trip_id);
  if (head.currentVersionId !== null && head.currentVersionId !== proposal.version_id) {
    await tx.query(
      `UPDATE itinerary_versions SET status = 'superseded' WHERE id = $1 AND trip_id = $2`,
      [head.currentVersionId, proposal.trip_id],
    );
  }
  await tx.query(
    `UPDATE itinerary_versions SET visibility = 'crew', status = 'proposed'
      WHERE id = $1 AND trip_id = $2 AND status <> 'current'`,
    [proposal.version_id, proposal.trip_id],
  );
  await tx.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [
    proposal.trip_id,
    proposal.version_id,
  ]);
}

export const sendProposalCommand = defineCommand({
  name: 'send_proposal',
  v: 1,
  schema: proposalIdPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const proposal = await requireProposalOrganiser(tx, payload.proposal_id);
    if (proposal.status !== 'building' && proposal.status !== 'sent') {
      throw new DomainError('STATE_INVALID', { state: proposal.status });
    }
  },
  handle: async (tx, payload, ctx) => {
    const proposal = await requireProposalOrganiser(tx, payload.proposal_id);
    const { rows } = await tx.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM proposal_versions WHERE proposal_id = $1',
      [payload.proposal_id],
    );
    const recipients = rows[0]?.n ?? 0;
    if (proposal.status === 'sent') return { proposal_id: proposal.id, recipients };
    if (recipients === 0) throw new DomainError('STATE_INVALID', { reason: 'no_recipients' });
    return asSystemRole(tx, async () => {
      await tx.query(
        `UPDATE proposals SET status = $3, sent_at = $2 WHERE id = $1 AND status = 'building'`,
        [proposal.id, ctx.clock.serverNow, 'sent'],
      );
      await publishProposedPlan(tx, proposal);
      const moved = await tx.query(
        `UPDATE trips SET status = 'proposed' WHERE id = $1 AND status = 'draft_review'`,
        [proposal.trip_id],
      );
      if ((moved.rowCount ?? 0) > 0) {
        await appendDomainEvent(tx, {
          type: 'trip.status_changed',
          aggregateKind: 'trip',
          aggregateId: proposal.trip_id,
          actorKind: 'user',
          actorId: ctx.uid,
          payload: { trip_id: proposal.trip_id, from: 'draft_review', to: 'proposed' },
          crewId: proposal.crew_id,
          tripId: proposal.trip_id,
        });
      }
      await appendDomainEvent(tx, {
        type: 'proposal.sent',
        aggregateKind: 'proposal',
        aggregateId: proposal.id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { trip_id: proposal.trip_id, proposal_id: proposal.id, recipients },
        crewId: proposal.crew_id,
        tripId: proposal.trip_id,
      });
      await postProposalCard(tx, proposal, ctx.uid);
      return { proposal_id: proposal.id, recipients };
    });
  },
});
