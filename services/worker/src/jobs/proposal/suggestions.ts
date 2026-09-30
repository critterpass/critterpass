/**
 * `proposal.suggestions` (after an open, a reply or an anonymous question, debounced ten minutes):
 * the organiser's tracker cards, decided by rules and worded by the guide. RESEND a member who has
 * not answered at their usual evening hour with their version's lead item; offer everyone a
 * cheaper option when someone asked anonymously (a crew of four or more only). Cards never name
 * someone next to a reason and never report an open; a card already handled stays handled. The
 * organisers' crew-level open count (`engagement.summary`) goes out here too, after the debounce,
 * so its timing never points at one member's open.
 */

async function publishEngagementSummary(tx: pg.PoolClient, proposalId: string, tripId: string) {
  const { rows } = await tx.query<{ opened: number; recipients: number }>(
    `SELECT (SELECT count(DISTINCT e.user_id)::int FROM engagement_events e
              WHERE e.proposal_id = $1 AND e.kind = 'opened') AS opened,
            (SELECT count(*)::int FROM proposal_versions v WHERE v.proposal_id = $1) AS recipients`,
    [proposalId],
  );
  const organisers = await tx.query<{ user_id: string }>(
    `SELECT user_id FROM trip_participants WHERE trip_id = $1 AND role = 'organiser'`,
    [tripId],
  );
  for (const { user_id } of organisers.rows) {
    await outbox(tx, userChannel(user_id), PROPOSAL_RT.engagementSummary, {
      proposal_id: proposalId,
      opened: rows[0]?.opened ?? 0,
      recipients: rows[0]?.recipients ?? 0,
    });
  }
}
import { personaIdSchema, wordSuggestions, type Gateway, type SuggestionCard } from '@cp/ai';
import { outbox, withSystem } from '@cp/db';
import {
  ANONYMOUS_MIN_CREW,
  engagementHour,
  nudgeSendTime,
  PROPOSAL_QUEUES,
  PROPOSAL_RT,
  userChannel,
  type PrivateReason,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

/** A member gets a resend card only once the proposal has had this long. */
export const RESEND_AFTER_MS = 12 * 3_600_000;

const OFFERS: Partial<
  Record<PrivateReason, { kind: 'cheaper_room' | 'skip_day'; template: string }>
> = {
  cost: {
    kind: 'cheaper_room',
    template: 'Someone asked about cost. Offer everyone the cheaper room option?',
  },
  plan: {
    kind: 'skip_day',
    template: 'Someone asked about the plan. Offer everyone a lighter day?',
  },
};

interface Card extends SuggestionCard {
  readonly targetUid: string | null;
  readonly payload: Record<string, unknown>;
}

async function resendCards(tx: pg.PoolClient, proposalId: string, now: Date): Promise<Card[]> {
  const { rows } = await tx.query<{
    user_id: string;
    name: string;
    tz: string;
    lead_item_id: string | null;
  }>(
    `SELECT v.recipient_id AS user_id, split_part(coalesce(u.display_name, ''), ' ', 1) AS name,
            coalesce(u.tz, 'UTC') AS tz, v.lead_item_id
       FROM proposal_versions v JOIN proposals p ON p.id = v.proposal_id
       JOIN users u ON u.id = v.recipient_id
       LEFT JOIN trip_participants tp ON tp.trip_id = v.trip_id AND tp.user_id = v.recipient_id
      WHERE v.proposal_id = $1 AND p.sent_at <= $2
        AND coalesce(tp.rsvp, 'unopened') IN ('unopened', 'opened')
      ORDER BY v.recipient_id`,
    [proposalId, new Date(now.getTime() - RESEND_AFTER_MS)],
  );
  const cards: Card[] = [];
  for (const row of rows) {
    const hours = await tx.query<{ hour_local: number; opens: number; updated_at: Date }>(
      'SELECT hour_local, opens, updated_at FROM app_open_hours WHERE user_id = $1',
      [row.user_id],
    );
    const hour = engagementHour(
      hours.rows.map((h) => ({ hourLocal: h.hour_local, opens: h.opens, updatedAt: h.updated_at })),
      now,
    );
    const at = nudgeSendTime({ now, tz: row.tz, hour, quiet: null });
    const time = at.local.slice(11, 16);
    const name = row.name || 'them';
    cards.push({
      id: `resend:${row.user_id}`,
      kind: 'resend',
      name: row.name || null,
      facts: { name, time },
      template: `Resend to ${name} at ${time} their time?`,
      targetUid: row.user_id,
      payload: { due_at: at.at.toISOString(), at_local: at.local, lead_item_id: row.lead_item_id },
    });
  }
  return cards;
}

async function offerCards(tx: pg.PoolClient, proposalId: string, tripId: string): Promise<Card[]> {
  const size = await tx.query<{ size: number }>('SELECT app.trip_crew_size($1) AS size', [tripId]);
  if ((size.rows[0]?.size ?? 0) < ANONYMOUS_MIN_CREW) return [];
  const { rows } = await tx.query<{ topic: PrivateReason }>(
    'SELECT DISTINCT topic FROM anonymous_suggestions WHERE proposal_id = $1 ORDER BY topic',
    [proposalId],
  );
  return rows.flatMap(({ topic }) => {
    const offer = OFFERS[topic];
    if (offer === undefined) return [];
    return [
      {
        id: `offer:${topic}`,
        kind: 'offer' as const,
        name: null,
        facts: { topic },
        template: offer.template,
        targetUid: null,
        payload: { topic, option: { kind: offer.kind, id: offer.kind } },
      },
    ];
  });
}

export async function runSuggestions(
  pool: pg.Pool,
  proposalId: string,
  gateway?: Pick<Gateway, 'callModel'>,
  now: Date = new Date(),
): Promise<{ written: number }> {
  const plan = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ trip_id: string; slug: string | null }>(
      `SELECT p.trip_id, g.slug FROM proposals p JOIN trips t ON t.id = p.trip_id
         LEFT JOIN guides g ON g.id = t.guide_id WHERE p.id = $1 AND p.status = 'sent'`,
      [proposalId],
    );
    const proposal = rows[0];
    if (proposal === undefined) return null;
    await publishEngagementSummary(tx, proposalId, proposal.trip_id);
    const names = await tx.query<{ name: string }>(
      `SELECT split_part(coalesce(u.display_name, ''), ' ', 1) AS name FROM crew_members cm
         JOIN trips t ON t.crew_id = cm.crew_id JOIN users u ON u.id = cm.user_id WHERE t.id = $1`,
      [proposal.trip_id],
    );
    await tx.query(
      `UPDATE rsvp_suggestions s SET status = 'expired'
         FROM trip_participants tp
        WHERE s.proposal_id = $1 AND s.status = 'open' AND s.kind = 'resend'
          AND tp.trip_id = s.trip_id AND tp.user_id = s.target_uid
          AND tp.rsvp NOT IN ('unopened', 'opened')`,
      [proposalId],
    );
    const cards = [
      ...(await resendCards(tx, proposalId, now)),
      ...(await offerCards(tx, proposalId, proposal.trip_id)),
    ];
    return { proposal, cards, crewNames: names.rows.map((r) => r.name).filter(Boolean) };
  });
  if (plan === null || plan.cards.length === 0) return { written: 0 };
  const guide = personaIdSchema.safeParse(plan.proposal.slug);
  const lines = await wordSuggestions(gateway, {
    guide: guide.success ? guide.data : 'guest',
    cards: plan.cards,
    crewNames: plan.crewNames,
  });
  return withSystem(pool, async (tx) => {
    let written = 0;
    for (const card of plan.cards) {
      const { rowCount } = await tx.query(
        `INSERT INTO rsvp_suggestions (proposal_id, trip_id, kind, target_uid, payload, copy, dedupe_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (proposal_id, dedupe_key) DO NOTHING`,
        [
          proposalId,
          plan.proposal.trip_id,
          card.kind,
          card.targetUid,
          JSON.stringify(card.payload),
          lines[card.id] ?? card.template,
          card.id,
        ],
      );
      written += rowCount ?? 0;
    }
    return { written };
  });
}

export function suggestionsJob(gateway: Pick<Gateway, 'callModel'> | undefined): AnyJobDefinition {
  return defineJob({
    queue: PROPOSAL_QUEUES.suggestions,
    schema: z.object({ proposal_id: z.uuid() }),
    singletonKey: (data) => data.proposal_id,
    async handler(data, { pool }) {
      return { ...(await runSuggestions(pool, data.proposal_id, gateway)) };
    },
  });
}
