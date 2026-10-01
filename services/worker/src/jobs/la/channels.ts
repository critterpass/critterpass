/**
 * `la.channels` (hourly): deletes the APNs broadcast channels of finished objects once their last
 * frame has left every lock screen (`delete_after`), keeping the app well under APNs' per-app
 * channel cap. A channel APNs no longer knows counts as deleted.
 */
import { withSystem } from '@cp/db';
import { appBundleIdSchema, LA_QUEUES } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import type { ApnsChannelManager } from '../../push/la-channels';

const BATCH = 200;

export async function collectChannels(
  pool: pg.Pool,
  channels: ApnsChannelManager | undefined,
  now = new Date(),
): Promise<{ deleted: number; kept: number }> {
  if (channels === undefined) return { deleted: 0, kept: 0 };
  const due = await withSystem(pool, (tx) =>
    tx.query<{
      id: string;
      env: 'sandbox' | 'prod';
      bundle_id: string;
      apns_channel_id: string | null;
    }>(
      `SELECT id, env, bundle_id, apns_channel_id FROM broadcast_channels
        WHERE deleted_at IS NULL AND delete_after IS NOT NULL AND delete_after < $1
        ORDER BY delete_after LIMIT $2`,
      [now, BATCH],
    ),
  );
  let deleted = 0;
  let kept = 0;
  for (const row of due.rows) {
    const bundle = appBundleIdSchema.safeParse(row.bundle_id);
    const gone =
      row.apns_channel_id === null || !bundle.success
        ? true
        : await channels.remove(row.env, bundle.data, row.apns_channel_id);
    if (!gone) {
      kept += 1;
      continue;
    }
    deleted += 1;
    await withSystem(pool, (tx) =>
      tx.query('UPDATE broadcast_channels SET deleted_at = $2 WHERE id = $1', [row.id, now]),
    );
  }
  return { deleted, kept };
}

export function laChannelsJob(channels: ApnsChannelManager | undefined): AnyJobDefinition {
  return defineJob({
    queue: LA_QUEUES.channels,
    schema: z.object({}).nullish(),
    async handler(_data, ctx) {
      return { ...(await collectChannels(ctx.pool, channels)) };
    },
  });
}
