/**
 * `create_proposal` (docs/api-contracts.md §4.7): an organiser builds the crew's proposal from the
 * approved plan. Reply-by defaults to a day before the earliest free cancellation of a booked stay
 * or two weeks before the trip, whichever is first, and is refused after that deadline or in the
 * past; a Viator hold is never an input. One pending version per recipient is queued for the
 * guide to write; a rebuild supersedes the last proposal.
 */
import { appendDomainEvent, sendInTx } from '@cp/db';
import {
  createProposalPayloadSchema,
  defaultReplyBy,
  DomainError,
  earliestFreeCancel,
  generateUuidV7,
  PROPOSAL_QUEUES,
  validateReplyBy,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { returned } from './shared';

const BUILDABLE_TRIP_STATUSES = new Set(['draft_review', 'proposed']);

export interface ReplyByFacts {
  readonly freeCancelDeadlines: Date[];
  readonly tripStart: Date | null;
}

/** Free-cancel deadlines of the trip's booked stays (as the caller sees them) and its start. */
export async function replyByFacts(tx: pg.PoolClient, tripId: string): Promise<ReplyByFacts> {
  const stays = await tx.query<{ free_cancel_until: Date }>(
    `SELECT free_cancel_until FROM bookings
      WHERE trip_id = $1 AND type = 'stay' AND status = 'booked' AND deleted_at IS NULL
        AND free_cancel_until IS NOT NULL`,
    [tripId],
  );
  const trip = await tx.query<{ start_date: string | null }>(
    'SELECT start_date::text AS start_date FROM trips WHERE id = $1',
    [tripId],
  );
  const start = trip.rows[0]?.start_date ?? null;
  return {
    freeCancelDeadlines: stays.rows.map((row) => row.free_cancel_until),
    tripStart: start === null ? null : new Date(`${start}T00:00:00Z`),
  };
}

/** Active crew members other than the sender who have not left the trip. */
async function recipients(tx: pg.PoolClient, tripId: string, sender: string): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT cm.user_id FROM trips t
       JOIN crew_members cm ON cm.crew_id = t.crew_id AND cm.status = 'active'
       LEFT JOIN trip_participants tp ON tp.trip_id = t.id AND tp.user_id = cm.user_id
      WHERE t.id = $1 AND cm.user_id <> $2 AND coalesce(tp.rsvp, 'unopened') <> 'out'
      ORDER BY cm.user_id`,
    [tripId, sender],
  );
  return rows.map((row) => row.user_id);
}

export const createProposalCommand = defineCommand({
  name: 'create_proposal',
  v: 1,
  schema: createProposalPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rows } = await tx.query<{ status: string; organiser: boolean }>(
      'SELECT status, app.is_trip_organiser(id) AS organiser FROM trips WHERE id = $1',
      [payload.trip_id],
    );
    const trip = rows[0];
    if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
    if (!trip.organiser) throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
    if (!BUILDABLE_TRIP_STATUSES.has(trip.status)) {
      throw new DomainError('STATE_INVALID', { state: trip.status });
    }
  },
  handle: async (tx, payload, ctx) => {
    const facts = await replyByFacts(tx, payload.trip_id);
    const now = ctx.clock.serverNow;
    let replyBy: Date | null;
    if (payload.config.reply_by !== undefined) {
      replyBy = new Date(payload.config.reply_by);
      const verdict = validateReplyBy(replyBy, { ...facts, now });
      if (!verdict.ok) throw new DomainError('VALIDATION', { field: 'reply_by', ...verdict });
    } else {
      replyBy = defaultReplyBy({ ...facts, now });
      if (replyBy === null) {
        throw new DomainError('STATE_INVALID', { reason: 'free_cancel_passed' });
      }
    }
    const people = await recipients(tx, payload.trip_id, ctx.uid);
    const proposalId = payload.proposal_id ?? generateUuidV7();
    return asSystemRole(tx, async () => {
      const trip = await tx.query<{ crew_id: string; version_id: string | null }>(
        `SELECT crew_id, coalesce(current_version_id, draft_version_id) AS version_id
           FROM trips WHERE id = $1`,
        [payload.trip_id],
      );
      await tx.query(
        `UPDATE proposals SET status = 'superseded' WHERE trip_id = $1 AND status <> 'superseded'`,
        [payload.trip_id],
      );
      await tx.query(
        `INSERT INTO proposals (id, trip_id, version_id, created_by, format, show_cost, personal,
                                options, reply_by, stay_free_cancel_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          proposalId,
          payload.trip_id,
          trip.rows[0]?.version_id ?? null,
          ctx.uid,
          payload.config.format,
          payload.config.show_cost,
          payload.config.personal,
          JSON.stringify(payload.config.options),
          replyBy,
          earliestFreeCancel(facts.freeCancelDeadlines),
        ],
      );
      for (const recipient of people) {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO proposal_versions (proposal_id, trip_id, recipient_id, shared)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [proposalId, payload.trip_id, recipient, !payload.config.personal],
        );
        const versionId = returned(rows).id;
        await sendInTx(
          tx,
          PROPOSAL_QUEUES.versions,
          { version_id: versionId },
          { singletonKey: versionId },
        );
      }
      await tx.query(
        `INSERT INTO hype_aggregates (proposal_id, trip_id, recipients) VALUES ($1, $2, $3)`,
        [proposalId, payload.trip_id, people.length],
      );
      await appendDomainEvent(tx, {
        type: 'proposal.created',
        aggregateKind: 'proposal',
        aggregateId: proposalId,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: {
          trip_id: payload.trip_id,
          proposal_id: proposalId,
          format: payload.config.format,
          recipients: people.length,
        },
        crewId: trip.rows[0]?.crew_id ?? null,
        tripId: payload.trip_id,
      });
      return {
        proposal_id: proposalId,
        reply_by: replyBy.toISOString(),
        recipients: people.length,
      };
    });
  },
});
