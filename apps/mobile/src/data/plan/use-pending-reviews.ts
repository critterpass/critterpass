/**
 * My placements waiting on me (7h-6 → 7h-7): change sets Tokek drafted for me from Ideas that I
 * haven't sent yet, newest first, each with the placement job that made it when that job has
 * synced. Drafts reach only their author, so this is always mine.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { useLiveRows } from './live-rows';

export const PENDING_REVIEWS_SQL = `SELECT c.id, c.created_at,
    (SELECT j.id FROM agent_jobs j
      WHERE j.trip_id = c.trip_id AND j.user_id = c.author_id AND j.kind = 'place_ideas'
        AND j.status = 'succeeded' AND instr(coalesce(j.result_ref, ''), c.id) > 0
      ORDER BY j.updated_at DESC LIMIT 1) AS job_id
  FROM change_sets c
  WHERE c.trip_id = ? AND c.trigger = 'ideas' AND c.status = 'draft'
    AND c.author_id = (SELECT value FROM local_state WHERE id = ?)
  ORDER BY c.created_at DESC, c.id`;
const PENDING_REVIEWS_TABLES = ['change_sets', 'agent_jobs', 'local_state'];

export interface PendingReview {
  readonly changesetId: string;
  readonly jobId: string | null;
  readonly createdAt: string | null;
}

export function usePendingReviews(tripId: string | null): {
  readonly loaded: boolean;
  readonly reviews: readonly PendingReview[];
} {
  const rows = useLiveRows<{ id: string; created_at: string | null; job_id: string | null }>(
    PENDING_REVIEWS_SQL,
    tripId === null ? null : [tripId, OWNER_UID_KEY],
    PENDING_REVIEWS_TABLES,
  );
  return useMemo(
    () => ({
      loaded: rows.loaded,
      reviews: rows.rows.map((row) => ({
        changesetId: row.id,
        jobId: row.job_id,
        createdAt: row.created_at,
      })),
    }),
    [rows.loaded, rows.rows],
  );
}
