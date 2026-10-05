/**
 * Who receives the proposal's inbox items and what each carries (the kinds are declared in
 * @cp/domain `PROPOSAL_INBOX_KINDS`): the proposal to every recipient who has not answered yet,
 * a member's own answer to the trip's organisers while the proposal is out, and the lock to
 * everyone holding a place. Items carry ids, a place name and counts; the app words them.
 */
import {
  ensureInboxKinds,
  PROPOSAL_INBOX_KINDS,
  PROPOSAL_ANSWERS,
  PROPOSAL_INBOX_KIND,
  proposalAnswerResolveKey,
  proposalRepliesResolveKey,
  tripHubPath,
  type InboxAction,
} from '@cp/domain';
import type pg from 'pg';

import { registerInboxFanout, type FanoutEvent } from '../inbox/fanout';
import { str } from '../setup/facts';

const OPEN: InboxAction = { id: 'open', style: 'primary' };

interface TripLine {
  readonly place: string;
  readonly guide: string;
}

async function tripLine(tx: pg.PoolClient, tripId: string): Promise<TripLine> {
  const { rows } = await tx.query<{ place: string | null; guide: string | null }>(
    `SELECT coalesce(d.name, c.name) AS place, g.slug AS guide
       FROM trips t JOIN crews c ON c.id = t.crew_id
       LEFT JOIN destinations d ON d.id = t.destination_id LEFT JOIN guides g ON g.id = t.guide_id
      WHERE t.id = $1`,
    [tripId],
  );
  return { place: rows[0]?.place ?? '', guide: rows[0]?.guide ?? 'tokek' };
}

/** The member whose own answer this event is, or null (an organiser or the lock moved them). */
function ownAnswer(event: FanoutEvent): { member: string; rsvp: string } | null {
  const member = str(event, 'user_id');
  const rsvp = str(event, 'rsvp');
  if (member === null || rsvp === null || event.actorId !== member) return null;
  return PROPOSAL_ANSWERS.includes(rsvp) ? { member, rsvp } : null;
}

function registerReceived(): void {
  registerInboxFanout({
    kind: PROPOSAL_INBOX_KIND.received,
    audience: async (tx, event) =>
      (
        await tx.query<{ recipient_id: string }>(
          'SELECT recipient_id FROM proposal_versions WHERE proposal_id = $1',
          [str(event, 'proposal_id')],
        )
      ).rows.map((row) => row.recipient_id),
    async build(tx, event, uid) {
      const proposalId = str(event, 'proposal_id');
      const tripId = str(event, 'trip_id');
      if (proposalId === null || tripId === null) return null;
      const { rows } = await tx.query<{ reply_by: Date | null; rsvp: string | null }>(
        `SELECT p.reply_by, tp.rsvp FROM proposals p
           LEFT JOIN trip_participants tp ON tp.trip_id = p.trip_id AND tp.user_id = $2
          WHERE p.id = $1 AND p.status = 'sent'`,
        [proposalId, uid],
      );
      const row = rows[0];
      // Withdrawn or locked since, or answered before the fan-out ran: nothing waits for them.
      if (row === undefined || PROPOSAL_ANSWERS.includes(row.rsvp ?? '')) return null;
      const trip = await tripLine(tx, tripId);
      return {
        tripId,
        data: {
          proposal_id: proposalId,
          trip_id: tripId,
          place: trip.place,
          guide: trip.guide,
          reply_by: row.reply_by?.toISOString() ?? null,
        },
        actions: [OPEN],
        deepLink: `/proposal/${proposalId}`,
        expiresAt: row.reply_by,
        resolveKey: proposalAnswerResolveKey(tripId, uid),
      };
    },
  });
}

function registerAnswered(): void {
  registerInboxFanout({
    kind: PROPOSAL_INBOX_KIND.answered,
    async audience(tx, event) {
      const answer = ownAnswer(event);
      const tripId = str(event, 'trip_id');
      if (answer === null || tripId === null) return [];
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT tp.user_id FROM trip_participants tp
          WHERE tp.trip_id = $1 AND tp.role = 'organiser' AND tp.rsvp <> 'out' AND tp.user_id <> $2
            AND EXISTS (SELECT 1 FROM proposals p WHERE p.trip_id = $1 AND p.status = 'sent')
          ORDER BY tp.user_id`,
        [tripId, answer.member],
      );
      return rows.map((row) => row.user_id);
    },
    async build(tx, event) {
      const answer = ownAnswer(event);
      const tripId = str(event, 'trip_id');
      if (answer === null || tripId === null) return null;
      const { rows } = await tx.query<{ id: string; recipients: number; answered: number }>(
        `SELECT p.id, count(v.id)::int AS recipients,
                count(v.id) FILTER (WHERE tp.rsvp = ANY ($2::text[]))::int AS answered
           FROM proposals p
           LEFT JOIN proposal_versions v ON v.proposal_id = p.id
           LEFT JOIN trip_participants tp ON tp.trip_id = p.trip_id AND tp.user_id = v.recipient_id
          WHERE p.trip_id = $1 AND p.status = 'sent'
          GROUP BY p.id ORDER BY p.created_at DESC LIMIT 1`,
        [tripId, [...PROPOSAL_ANSWERS]],
      );
      const proposal = rows[0];
      if (proposal === undefined) return null;
      const trip = await tripLine(tx, tripId);
      return {
        tripId,
        actorId: answer.member,
        data: {
          proposal_id: proposal.id,
          trip_id: tripId,
          user_id: answer.member,
          rsvp: answer.rsvp,
          place: trip.place,
          answered: proposal.answered,
          recipients: proposal.recipients,
        },
        actions: [OPEN],
        deepLink: `/proposal/${proposal.id}/tracker`,
        resolveKey: proposalRepliesResolveKey(tripId),
      };
    },
  });
}

function registerTripLocked(): void {
  registerInboxFanout({
    kind: PROPOSAL_INBOX_KIND.tripLocked,
    async audience(tx, event) {
      if (event.payload['to'] !== 'confirmed') return [];
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM trip_participants
          WHERE trip_id = $1 AND rsvp NOT IN ('out', 'waitlisted') ORDER BY user_id`,
        [str(event, 'trip_id')],
      );
      return rows.map((row) => row.user_id);
    },
    async build(tx, event) {
      const tripId = str(event, 'trip_id');
      if (tripId === null) return null;
      const trip = await tripLine(tx, tripId);
      return {
        tripId,
        data: { trip_id: tripId, place: trip.place, guide: trip.guide },
        deepLink: tripHubPath(tripId),
      };
    },
  });
}

let registered = false;

/** Registers the proposal's inbox fan-outs once per process. */
export function registerProposalInboxFanouts(): void {
  if (registered) return;
  registered = true;
  ensureInboxKinds(PROPOSAL_INBOX_KINDS);
  registerReceived();
  registerAnswered();
  registerTripLocked();
}
