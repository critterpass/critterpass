/**
 * The ideas board in the console (`feedback` area, support): `GET /v1/admin/ideas` lists ideas by
 * status, most voted first, with the count per status; `set_idea_status` publishes or declines a
 * suggested idea, moves a published one (planned, building, shipped with its version) and writes
 * the team note. A published idea is on everyone's board at once: the app reads `ideas` by status.
 */
import {
  DomainError,
  adminIdeasQuerySchema,
  adminIdeasResponseSchema,
  canMoveIdea,
  setIdeaStatusPayloadSchema,
  type IdeaStatus,
} from '@cp/domain';
import type pg from 'pg';

import { withAdminReader } from '../reads';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from '../registry';

interface IdeaRow {
  id: string;
  title: string;
  description: string | null;
  locale: string;
  status: IdeaStatus;
  team_note: string | null;
  fixed_in_version: string | null;
  votes_count: number;
  author_id: string | null;
  author_name: string | null;
  created_at: Date;
  status_changed_at: Date;
}

export function ideasArea(pool: pg.Pool) {
  return defineAdminArea({
    id: 'ideas',
    count: {
      area: 'feedback',
      run: async (tx) => {
        const { rows } = await tx.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM ideas WHERE status = 'pending_review'",
        );
        return { count: rows[0]?.n ?? 0, tone: 'plain' };
      },
    },
    reads: [
      defineAdminRead({
        path: '/ideas',
        area: 'feedback',
        summary: 'Ideas by status, most voted first, with the count per status',
        query: adminIdeasQuerySchema,
        response: adminIdeasResponseSchema,
        run: ({ admin, query }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const ideas = await tx.query<IdeaRow>(
              `SELECT i.id, i.title, i.description, i.locale, i.status, i.team_note,
                      i.fixed_in_version, i.votes_count, i.author_id,
                      coalesce(u.display_name, u.username) AS author_name,
                      i.created_at, i.status_changed_at
                 FROM ideas i LEFT JOIN users u ON u.id = i.author_id
                WHERE i.status = $1
                ORDER BY i.votes_count DESC, i.created_at DESC LIMIT 200`,
              [query.status],
            );
            const counts = await tx.query<{ status: string; n: number }>(
              'SELECT status, count(*)::int AS n FROM ideas GROUP BY status',
            );
            return {
              items: ideas.rows.map((row) => ({
                ...row,
                created_at: row.created_at.toISOString(),
                status_changed_at: row.status_changed_at.toISOString(),
              })),
              counts: Object.fromEntries(counts.rows.map((row) => [row.status, row.n])),
            };
          }),
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'set_idea_status',
        schema: setIdeaStatusPayloadSchema,
        audit: (payload, result: { title: string; from: IdeaStatus; status: IdeaStatus }) => ({
          targetKind: 'idea',
          targetId: payload.idea_id,
          summary: `${result.title} · ${result.status.replaceAll('_', ' ')}`,
          detail: {
            before: { status: result.from },
            after: { status: result.status },
            ...(payload.team_note !== undefined ? { team_note: payload.team_note } : {}),
            ...(payload.fixed_in_version !== undefined
              ? { fixed_in_version: payload.fixed_in_version }
              : {}),
          },
        }),
        handle: async (tx, payload) => {
          const { rows } = await tx.query<{ title: string; status: IdeaStatus }>(
            'SELECT title, status FROM ideas WHERE id = $1 FOR UPDATE',
            [payload.idea_id],
          );
          const idea = rows[0];
          if (idea === undefined) throw new DomainError('NOT_FOUND');
          if (payload.status !== undefined && !canMoveIdea(idea.status, payload.status)) {
            throw new DomainError('STATE_INVALID', { from: idea.status, to: payload.status });
          }
          const status = payload.status ?? idea.status;
          await tx.query(
            `UPDATE ideas
                SET status = $2,
                    status_changed_at = CASE WHEN status = $2 THEN status_changed_at ELSE now() END,
                    team_note = CASE WHEN $3 THEN $4 ELSE team_note END,
                    fixed_in_version = coalesce($5, fixed_in_version),
                    updated_at = now()
              WHERE id = $1`,
            [
              payload.idea_id,
              status,
              payload.team_note !== undefined,
              payload.team_note ?? null,
              status === 'shipped' ? (payload.fixed_in_version ?? null) : null,
            ],
          );
          return { title: idea.title, from: idea.status, status };
        },
      }),
    ],
  });
}
