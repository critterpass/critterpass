/**
 * `GET /v1/help/ideas?status` (docs/api-contracts.md §5.5): the public ideas board, every idea past
 * review, most voted first. The same rows and columns the help stream syncs: authors, embeddings and
 * ideas still waiting for review never leave the server (the author's own pending ideas ride `me`).
 */
import { withUser } from '@cp/db';
import { DomainError } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession } from '../commands/_framework/session';
import { sendSharedContent } from './shared-content-cache';
import type { SharedContentDeps } from './shared-content';

export const BOARD_STATUSES = [
  'open',
  'planned',
  'building',
  'shipped',
  'declined',
  'merged',
] as const;

export interface BoardIdea {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly locale: string;
  readonly status: (typeof BOARD_STATUSES)[number];
  readonly team_note: string | null;
  readonly fixed_in_version: string | null;
  readonly merged_into_id: string | null;
  readonly votes_count: number;
  readonly status_changed_at: string;
  readonly created_at: string;
  readonly updated_at: string;
}

const querySchema = z.object({ status: z.enum(BOARD_STATUSES).optional() });

type IdeaRow = Omit<BoardIdea, 'status_changed_at' | 'created_at' | 'updated_at'> & {
  status_changed_at: Date;
  created_at: Date;
  updated_at: Date;
};

export function registerHelpIdeasRoute(app: OpenAPIHono<AppEnv>, deps: SharedContentDeps): void {
  app.get('/v1/help/ideas', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) throw new DomainError('VALIDATION', { reason: 'ideas_query' });
    const status = parsed.data.status ?? null;
    const rows = await withUser(deps.pool, uid, 'unknown', async (tx) => {
      const result = await tx.query<IdeaRow>(
        `SELECT id, title, description, locale, status, team_note, fixed_in_version, merged_into_id,
                votes_count, status_changed_at, created_at, updated_at
           FROM ideas
          WHERE status <> 'pending_review' AND ($1::text IS NULL OR status = $1)
          ORDER BY votes_count DESC, created_at DESC, id`,
        [status],
      );
      return result.rows;
    });
    const ideas: BoardIdea[] = rows.map((row) => ({
      ...row,
      status_changed_at: row.status_changed_at.toISOString(),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    }));
    return sendSharedContent(c, { ideas });
  });
}
