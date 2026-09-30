/**
 * What every proposal command shares: loading a proposal as the caller may see it (RLS), the
 * organiser and recipient checks, the crew hype recompute and the realtime fan-out. Only public
 * statuses and replies are ever published; an open or a private reason never is.
 */
import { outbox } from '@cp/db';
import { channelName, DomainError, PROPOSAL_RT } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

/** The one row a write just returned; its absence is a bug, never a user error. */
export function returned<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('expected a returned row');
  return row;
}

export interface ProposalRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly status: string;
  readonly sent_at: Date | null;
  readonly reply_by: Date;
  readonly show_cost: boolean;
  readonly personal: boolean;
  readonly organiser: boolean;
}

/** The proposal as the caller sees it; `NOT_FOUND` when RLS hides it (never leak existence). */
export async function loadProposal(tx: pg.PoolClient, proposalId: string): Promise<ProposalRow> {
  const { rows } = await tx.query<ProposalRow>(
    `SELECT p.id, p.trip_id, t.crew_id, p.status, p.sent_at, p.reply_by, p.show_cost, p.personal,
            app.is_trip_organiser(p.trip_id) AS organiser
       FROM proposals p JOIN trips t ON t.id = p.trip_id WHERE p.id = $1`,
    [proposalId],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'proposal' });
  return row;
}

export async function requireProposalOrganiser(
  tx: pg.PoolClient,
  proposalId: string,
): Promise<ProposalRow> {
  const proposal = await loadProposal(tx, proposalId);
  if (!proposal.organiser) throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
  return proposal;
}

/** A sent proposal the caller received (has a version of); `NOT_ELIGIBLE` otherwise. */
export async function requireRecipient(
  tx: pg.PoolClient,
  proposalId: string,
  uid: string,
): Promise<ProposalRow> {
  const proposal = await loadProposal(tx, proposalId);
  const { rows } = await tx.query(
    'SELECT 1 FROM proposal_versions WHERE proposal_id = $1 AND recipient_id = $2',
    [proposalId, uid],
  );
  if (rows.length === 0 || proposal.sent_at === null) {
    throw new DomainError('NOT_ELIGIBLE', { reason: 'not_a_recipient' });
  }
  if (proposal.status === 'superseded') {
    throw new DomainError('STATE_INVALID', { state: proposal.status });
  }
  return proposal;
}

export async function tripOrganisers(tx: pg.PoolClient, tripId: string): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT user_id FROM trip_participants WHERE trip_id = $1 AND role = 'organiser'
      ORDER BY user_id`,
    [tripId],
  );
  return rows.map((row) => row.user_id);
}

export function publishProposal<Data>(
  tx: pg.PoolClient,
  proposalId: string,
  type: string,
  data: Data,
): Promise<unknown> {
  return asSystemRole(tx, () => outbox(tx, channelName('proposal', proposalId), type, data));
}

export interface Hype {
  readonly hype_pct: number;
  readonly reacted_count: number;
  readonly boarded_count: number;
  readonly recipients: number;
}

/**
 * Crew hype from public signals only: recipients who reacted or boarded, over all recipients.
 * Upserted and published on `proposal:{id}`.
 */
export function recomputeHype(tx: pg.PoolClient, proposal: ProposalRow): Promise<Hype> {
  return asSystemRole(tx, async () => {
    const { rows } = await tx.query<Hype>(
      `WITH recipients AS (
         SELECT v.recipient_id AS uid FROM proposal_versions v WHERE v.proposal_id = $1
       ), reacted AS (
         SELECT DISTINCT r.user_id AS uid FROM proposal_reactions r WHERE r.proposal_id = $1
       ), boarded AS (
         SELECT tp.user_id AS uid FROM trip_participants tp
          WHERE tp.trip_id = $2 AND tp.rsvp = 'in' AND tp.user_id IN (SELECT uid FROM recipients)
       )
       INSERT INTO hype_aggregates (proposal_id, trip_id, hype_pct, reacted_count, boarded_count,
                                    recipients, updated_at)
       SELECT $1, $2,
              CASE WHEN (SELECT count(*) FROM recipients) = 0 THEN 0 ELSE
                round(100.0 * (SELECT count(*) FROM (SELECT uid FROM reacted UNION SELECT uid FROM boarded) u
                                WHERE u.uid IN (SELECT uid FROM recipients))
                      / (SELECT count(*) FROM recipients))::smallint END,
              (SELECT count(*) FROM reacted WHERE uid IN (SELECT uid FROM recipients))::int,
              (SELECT count(*) FROM boarded)::int,
              (SELECT count(*) FROM recipients)::int,
              now()
       ON CONFLICT (proposal_id) DO UPDATE SET
         hype_pct = EXCLUDED.hype_pct, reacted_count = EXCLUDED.reacted_count,
         boarded_count = EXCLUDED.boarded_count, recipients = EXCLUDED.recipients,
         updated_at = now()
       RETURNING hype_pct, reacted_count, boarded_count, recipients`,
      [proposal.id, proposal.trip_id],
    );
    const hype = returned(rows);
    await publishProposal(tx, proposal.id, PROPOSAL_RT.hype, hype);
    return hype;
  });
}
