/**
 * The evening roundup (docs/api-contracts-async.md §2.3, 5b-1). Every 5 minutes `roundup.scan`
 * finds users with rolled-up items whose roundup time minus 10 minutes has just passed in their
 * roundup zone (the trip's while travelling, otherwise the device's) and enqueues `roundup.build` for (user, local date). The build ranks what rolled up since
 * the previous roundup, needs-you first, keeps five, and sends one push from the recipient's guide.
 * `roundups (user_id, local_date)` is unique and written first, so a retried or doubled build
 * sends nothing twice. Nothing to say means no roundup at all.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { DEFAULT_QUEUE_SPEC, defineJob, enqueue, type JobDefinition } from '../../boss';
import type { CopyRenderer } from '../../push/render';
import { loadRecipient, ON_TRIP_TZ_SQL } from '../notify/audience';
import { enqueuePushSend } from '../notify/route';
import { pushTargets } from '../notify/store';
import { roundupLines, type RoundupLineSource } from './lines';
import { rankRoundupItems, type RoundupCandidate } from './rank';
import { composeRoundup } from './template';

export const ROUNDUP_SCAN_QUEUE = 'roundup.scan';
export const ROUNDUP_BUILD_QUEUE = 'roundup.build';
/** The roundup goes out this long before the user's roundup time. */
const LEAD_MINUTES = 10;
/** A scan that runs late (a deploy, a slow minute) still catches a window this long. */
const GRACE_SECONDS = 30 * 60;

export interface RoundupDeps {
  readonly renderer: CopyRenderer;
  readonly now?: () => Date;
}

export interface DueRoundup {
  readonly user_id: string;
  readonly local_date: string;
}

/** Users whose roundup is due at `now` and who have not had today's yet. */
export async function dueRoundups(tx: pg.PoolClient, now: Date): Promise<DueRoundup[]> {
  const { rows } = await tx.query<DueRoundup>(
    `WITH people AS (
       SELECT u.id AS user_id,
         CASE WHEN coalesce(p.roundup_tz, 'trip') = 'trip'
           THEN coalesce((${ON_TRIP_TZ_SQL}), d.tz, u.tz, 'UTC')
           ELSE coalesce(d.tz, u.tz, 'UTC') END AS tz,
         coalesce(p.roundup_time, time '20:00') - make_interval(mins => $3) AS send_time
       FROM users u
       LEFT JOIN notification_prefs p ON p.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT tz FROM devices WHERE user_id = u.id ORDER BY last_seen_at DESC LIMIT 1
       ) d ON true
       WHERE u.status NOT IN ('closed', 'purged')
         AND EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.user_id = u.id AND n.state = 'rolled_into_roundup'
             AND n.created_at > $1::timestamptz - interval '48 hours'
         )
     ), clocks AS (
       SELECT user_id, send_time, ($1::timestamptz AT TIME ZONE tz) AS local_now FROM people
     )
     SELECT user_id, local_now::date::text AS local_date FROM clocks
     WHERE mod((extract(epoch FROM local_now::time) - extract(epoch FROM send_time) + 86400)::numeric,
             86400) < $2
       AND NOT EXISTS (
         SELECT 1 FROM roundups r WHERE r.user_id = clocks.user_id AND r.local_date = local_now::date
       )`,
    [now, GRACE_SECONDS, LEAD_MINUTES],
  );
  return rows;
}

interface ItemRow {
  id: string;
  key: string;
  title: string;
  body: string;
  deep_link: string | null;
  needs_you: boolean;
  created_at: Date;
}

type PendingItem = RoundupCandidate & { readonly row: RoundupLineSource };

async function pendingItems(tx: pg.PoolClient, uid: string, now: Date): Promise<PendingItem[]> {
  const { rows } = await tx.query<ItemRow>(
    `SELECT n.id, n.key, n.title, n.body, n.deep_link, n.needs_you, n.created_at
       FROM notifications n
     WHERE n.user_id = $1 AND n.state = 'rolled_into_roundup' AND n.created_at <= $2
       AND (n.expires_at IS NULL OR n.expires_at > $2)
       AND n.created_at > coalesce(
         (SELECT max(r.created_at) FROM roundups r WHERE r.user_id = $1),
         $2::timestamptz - interval '24 hours')`,
    [uid, now],
  );
  return rows.map((row) => ({
    id: row.id,
    text: row.body,
    needsYou: row.needs_you,
    createdAt: row.created_at,
    row: { key: row.key, title: row.title, body: row.body, deepLink: row.deep_link },
  }));
}

interface GuideRow {
  id: string;
  slug: string;
  name: string;
}

/** The guide of the trip under way, else of the user's most recent live trip, else Tokek. */
async function activeGuide(tx: pg.PoolClient, uid: string): Promise<GuideRow | undefined> {
  const { rows } = await tx.query<GuideRow>(
    `SELECT g.id, g.slug, g.name FROM guides g WHERE g.id = coalesce(
       (SELECT t.guide_id FROM trip_participants tp JOIN trips t ON t.id = tp.trip_id
        WHERE tp.user_id = $1 AND tp.rsvp <> 'out' AND t.status = 'in_trip' AND t.guide_id IS NOT NULL
        ORDER BY t.start_date DESC NULLS LAST LIMIT 1),
       (SELECT t.guide_id FROM trip_participants tp JOIN trips t ON t.id = tp.trip_id
        WHERE tp.user_id = $1 AND tp.rsvp <> 'out' AND t.guide_id IS NOT NULL
          AND t.status NOT IN ('archived', 'cancelled')
        ORDER BY t.updated_at DESC LIMIT 1),
       (SELECT id FROM guides WHERE slug = 'tokek'))`,
    [uid],
  );
  return rows[0];
}

export type RoundupOutcome =
  | { readonly outcome: 'sent' | 'no_device'; readonly roundupId: string; readonly lines: number }
  | { readonly outcome: 'empty' | 'already_built' | 'no_recipient' };

export function buildRoundup(
  pool: pg.Pool,
  deps: RoundupDeps,
  data: DueRoundup,
): Promise<RoundupOutcome> {
  const now = deps.now?.() ?? new Date();
  return withSystem(pool, async (tx) => {
    // One build per user and local date at a time: a concurrent build waits here, then sees the
    // committed roundup below. Without it, a build that starts before another commits can read that
    // roundup's lines as already rolled up and report `empty` instead of `already_built`.
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
      `roundup:${data.user_id}`,
      data.local_date,
    ]);
    const done = await tx.query('SELECT 1 FROM roundups WHERE user_id = $1 AND local_date = $2', [
      data.user_id,
      data.local_date,
    ]);
    if (done.rowCount) return { outcome: 'already_built' };
    const recipient = await loadRecipient(tx, data.user_id, now);
    if (recipient === undefined) return { outcome: 'no_recipient' };
    const pending = await pendingItems(tx, data.user_id, now);
    const items = rankRoundupItems(pending);
    if (items.length === 0) return { outcome: 'empty' };
    const sources = new Map(pending.map((item) => [item.id, item.row]));

    const guide = await activeGuide(tx, data.user_id);
    const copy = await composeRoundup(deps.renderer, recipient.locale, {
      guideName: guide?.name,
      lines: items.map((item) => item.text),
    });
    const created = await tx.query<{ id: string }>(
      `INSERT INTO roundups (user_id, local_date, tz, guide_id, notification_ids, lines)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, local_date) DO NOTHING RETURNING id`,
      [
        data.user_id,
        data.local_date,
        recipient.roundupTz,
        guide?.id ?? null,
        items.map((item) => item.id),
        JSON.stringify(
          items.map((item) => ({
            notification_id: item.id,
            text: item.text,
            needs_you: item.needsYou,
          })),
        ),
      ],
    );
    const roundupId = created.rows[0]?.id;
    if (roundupId === undefined) return { outcome: 'already_built' };

    const devices = await pushTargets(tx, data.user_id);
    const sender = guide
      ? {
          kind: 'guide',
          id: guide.slug,
          name: guide.name,
          avatar: `avatars/guide-${guide.slug}@3x.png`,
        }
      : { kind: 'system', id: 'critterpass', name: 'CritterPass' };
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO notifications (user_id, key, category, class, sender, template_id, title, body, ctx,
         collapse_key, thread_id, dedupe_key, local_date, state, drop_reason)
       VALUES ($1, 'evening_roundup', 'cp.roundup', 'roundup_only', $2, $3, $4, $5, $6, $7, 'roundup',
         $8, $9, $10, $11)
       RETURNING id`,
      [
        data.user_id,
        JSON.stringify(sender),
        copy.templateId,
        copy.title,
        copy.body,
        JSON.stringify({
          subtitle: copy.subtitle,
          roundup_id: roundupId,
          count: items.length,
          lines: roundupLines(
            items.flatMap((item) => {
              const source = sources.get(item.id);
              return source === undefined ? [] : [source];
            }),
          ),
        }),
        `roundup:${data.local_date}`,
        `evening_roundup:${data.local_date}`,
        data.local_date,
        devices.length > 0 ? 'queued' : 'dropped',
        devices.length > 0 ? null : 'no_push_token',
      ],
    );
    const notificationId = rows[0]?.id;
    if (notificationId === undefined) throw new Error('roundup notification was not written');
    for (const deviceId of devices) {
      await enqueuePushSend(tx, { notification_id: notificationId, device_id: deviceId });
    }
    if (devices.length > 0) {
      await tx.query('UPDATE roundups SET sent_at = $2 WHERE id = $1', [roundupId, now]);
    }
    return { outcome: devices.length > 0 ? 'sent' : 'no_device', roundupId, lines: items.length };
  });
}

const buildDataSchema = z.object({ user_id: z.uuid(), local_date: z.iso.date() });

export function roundupBuildJob(deps: RoundupDeps): JobDefinition<DueRoundup> {
  return defineJob({
    queue: ROUNDUP_BUILD_QUEUE,
    schema: buildDataSchema,
    singletonKey: (data) => `${data.user_id}:${data.local_date}`,
    concurrency: 4,
    handler: async (data, ctx) => ({ ...(await buildRoundup(ctx.pool, deps, data)) }),
  });
}

export function roundupScanJob(
  build: JobDefinition<DueRoundup>,
  now: () => Date = () => new Date(),
): JobDefinition<unknown> {
  return defineJob({
    queue: ROUNDUP_SCAN_QUEUE,
    spec: {
      ...DEFAULT_QUEUE_SPEC,
      policy: 'stately',
      retryLimit: 1,
      retryBackoff: false,
      expireInSeconds: 4 * 60,
      keepCompletedSeconds: 86_400,
      cron: { expr: '*/5 * * * *', tz: 'UTC' },
    },
    schema: z.unknown(),
    handler: async (_data, ctx) => {
      const due = await withSystem(ctx.pool, (tx) => dueRoundups(tx, now()));
      for (const roundup of due) await enqueue(ctx.boss, build, roundup);
      return { enqueued: due.length };
    },
  });
}
