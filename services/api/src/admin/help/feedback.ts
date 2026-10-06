/**
 * Feedback tickets in the console (`feedback` area, support): `GET /v1/admin/feedback` lists the
 * tickets of one status, soonest reply due first, with what triage found (kind, area, severity,
 * summary, the ticket it repeats) and the tracker issue it was filed under;
 * `set_feedback_status` marks a ticket new, replied or closed; `merge_feedback_into_idea` files a
 * ticket under the idea it asks for and closes it. Device details and attachments are not read.
 */
import {
  DomainError,
  adminFeedbackQuerySchema,
  adminFeedbackResponseSchema,
  mergeFeedbackIntoIdeaPayloadSchema,
  setFeedbackStatusPayloadSchema,
  type AdminFeedbackTicket,
  type FeedbackStatus,
} from '@cp/domain';
import type pg from 'pg';

import { withAdminReader } from '../reads';
import { defineAdminCommand, defineAdminRead } from '../registry';

type TicketRow = Omit<AdminFeedbackTicket, 'ticket_no' | 'reply_due_at' | 'created_at'> & {
  ticket_no: string;
  duplicate_of_no: string | null;
  reply_due_at: Date;
  created_at: Date;
};

export function feedbackReads(pool: pg.Pool) {
  return [
    defineAdminRead({
      path: '/feedback',
      area: 'feedback',
      summary: 'Feedback tickets by status, soonest reply due first, with their triage',
      query: adminFeedbackQuerySchema,
      response: adminFeedbackResponseSchema,
      run: ({ admin, query }) =>
        withAdminReader(pool, admin.uid, async (tx) => {
          const tickets = await tx.query<TicketRow>(
            `SELECT t.id, t.ticket_no, t.status, t.mood, t.category, t.body, t.source,
                    t.triage_kind AS kind, t.triage_area AS area, t.severity, t.triage_summary,
                    d.ticket_no AS duplicate_of_no, t.duplicate_score, t.tracker_issue_id,
                    t.fixed_in_version, t.idea_id, i.title AS idea_title, t.app_version,
                    t.reply_channel, t.reply_due_at, t.created_at, t.user_id,
                    coalesce(u.display_name, u.username) AS user_name
               FROM feedback_tickets t
               LEFT JOIN feedback_tickets d ON d.id = t.duplicate_of
               LEFT JOIN ideas i ON i.id = t.idea_id
               LEFT JOIN users u ON u.id = t.user_id
              WHERE t.status = $1
              ORDER BY t.reply_due_at, t.created_at LIMIT 200`,
            [query.status],
          );
          const counts = await tx.query<{ status: string; n: number }>(
            'SELECT status, count(*)::int AS n FROM feedback_tickets GROUP BY status',
          );
          return {
            items: tickets.rows.map((row) => ({
              ...row,
              ticket_no: Number(row.ticket_no),
              duplicate_of_no: row.duplicate_of_no === null ? null : Number(row.duplicate_of_no),
              reply_due_at: row.reply_due_at.toISOString(),
              created_at: row.created_at.toISOString(),
            })),
            counts: Object.fromEntries(counts.rows.map((row) => [row.status, row.n])),
          };
        }),
    }),
  ];
}

async function lockTicket(tx: pg.PoolClient, id: string) {
  const { rows } = await tx.query<{ ticket_no: string; status: FeedbackStatus }>(
    'SELECT ticket_no, status FROM feedback_tickets WHERE id = $1 FOR UPDATE',
    [id],
  );
  const ticket = rows[0];
  if (ticket === undefined) throw new DomainError('NOT_FOUND');
  return { ref: `CP-${ticket.ticket_no}`, status: ticket.status };
}

export function feedbackCommands() {
  return [
    defineAdminCommand({
      name: 'set_feedback_status',
      schema: setFeedbackStatusPayloadSchema,
      audit: (payload, result: { ref: string; from: FeedbackStatus; status: FeedbackStatus }) => ({
        targetKind: 'feedback_ticket',
        targetId: payload.ticket_id,
        summary: `${result.ref} · ${result.status}`,
        detail: { before: { status: result.from }, after: { status: result.status } },
      }),
      handle: async (tx, payload) => {
        const ticket = await lockTicket(tx, payload.ticket_id);
        await tx.query('UPDATE feedback_tickets SET status = $2 WHERE id = $1', [
          payload.ticket_id,
          payload.status,
        ]);
        return { ref: ticket.ref, from: ticket.status, status: payload.status };
      },
    }),
    defineAdminCommand({
      name: 'merge_feedback_into_idea',
      schema: mergeFeedbackIntoIdeaPayloadSchema,
      audit: (payload, result: { ref: string; idea: string }) => ({
        targetKind: 'feedback_ticket',
        targetId: payload.ticket_id,
        summary: `${result.ref} · filed under "${result.idea}"`,
        detail: { idea_id: payload.idea_id },
      }),
      handle: async (tx, payload) => {
        const ticket = await lockTicket(tx, payload.ticket_id);
        const idea = await tx.query<{ title: string; status: string }>(
          'SELECT title, status FROM ideas WHERE id = $1',
          [payload.idea_id],
        );
        const found = idea.rows[0];
        if (found === undefined) throw new DomainError('NOT_FOUND', { reason: 'idea' });
        if (found.status === 'merged' || found.status === 'declined') {
          throw new DomainError('STATE_INVALID', { reason: 'idea_closed' });
        }
        await tx.query(
          "UPDATE feedback_tickets SET idea_id = $2, status = 'closed' WHERE id = $1",
          [payload.ticket_id, payload.idea_id],
        );
        return { ref: ticket.ref, idea: found.title };
      },
    }),
  ];
}
