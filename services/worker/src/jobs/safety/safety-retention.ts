/**
 * `safety.retention` (daily): SOS health notes and threads go 90 days after they were written, and
 * closed sessions (with anything left of them) a year after they opened
 * (docs/data-model-sync-and-privacy.md §6).
 */
import { withSystem } from '@cp/db';
import { SAFETY_QUEUES } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export function purgeSafetyData(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<{ readonly notes: number; readonly messages: number; readonly sessions: number }> {
  return withSystem(pool, async (tx) => {
    const notes = await tx.query(
      "DELETE FROM help_session_private WHERE created_at < $1::timestamptz - interval '90 days'",
      [now],
    );
    const messages = await tx.query(
      "DELETE FROM help_session_messages WHERE created_at < $1::timestamptz - interval '90 days'",
      [now],
    );
    const sessions = await tx.query(
      `DELETE FROM help_sessions
        WHERE status IN ('resolved', 'stale') AND opened_at < $1::timestamptz - interval '1 year'`,
      [now],
    );
    return {
      notes: notes.rowCount ?? 0,
      messages: messages.rowCount ?? 0,
      sessions: sessions.rowCount ?? 0,
    };
  });
}

export function safetyRetentionJob(): AnyJobDefinition {
  return defineJob({
    queue: SAFETY_QUEUES.retention,
    schema: z.unknown(),
    async handler(_data, { pool }) {
      return { ...(await purgeSafetyData(pool)) };
    },
  });
}
