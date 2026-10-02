/**
 * `la.orchestrate` (docs/api-contracts-async.md §2.2): one object's Live Activities on every
 * device, in three steps so no push waits inside a transaction:
 * 1. plan (one transaction holding the object's frame row): load, decide, persist;
 * 2. deliver the pushes;
 * 3. record what came back: channels created, tokens APNs retired, starts that failed.
 * One run per object at a time (the queue is keyed by object), so frames never interleave.
 */
import { withSystem } from '@cp/db';
import {
  LA_KIND_SPECS,
  LA_QUEUES,
  laOrchestrateJobSchema,
  laOrchestrateSingletonKey,
  type AppBundleId,
  type LaKind,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { lockscreenCopy } from '../../push/lockscreen-copy';
import {
  deliverAll,
  type ChannelBook,
  type LaSend,
  type LaSendOutcome,
  type LaTransports,
} from './deliver';
import { planLive } from './plan';
import { endSends, liveRows, markEnded } from './rows';
import type { LaLoader, LaLoaders, LaRender, LaSnapshot } from './snapshot';

export interface LaDeps extends LaTransports {
  readonly loaders: LaLoaders;
  readonly render: LaRender;
  readonly switches: { isOn(key: string): Promise<boolean> };
  readonly defaultBundleId: AppBundleId;
  readonly now?: () => Date;
}

export type LaRunOutcome =
  | { readonly outcome: 'no_loader' | 'idle' }
  | { readonly outcome: 'switched_off'; readonly ended: number }
  | {
      readonly outcome: 'sent';
      readonly sends: number;
      readonly failed: number;
      readonly fallbacks: number;
    };

interface Frame {
  seq: number;
  phase: 'live' | 'ended';
  last_state: Record<string, unknown> | null;
}

async function lockFrame(tx: pg.PoolClient, kind: LaKind, refId: string): Promise<Frame | null> {
  const { rows } = await tx.query<Frame>(
    'SELECT seq, phase, last_state FROM la_object_states WHERE kind = $1 AND ref_id = $2 FOR UPDATE',
    [kind, refId],
  );
  return rows[0] ?? null;
}

async function createFrame(tx: pg.PoolClient, kind: LaKind, refId: string): Promise<Frame> {
  await tx.query(
    'INSERT INTO la_object_states (kind, ref_id) VALUES ($1, $2) ON CONFLICT (kind, ref_id) DO NOTHING',
    [kind, refId],
  );
  const frame = await lockFrame(tx, kind, refId);
  if (frame === null) throw new Error('la_object_states row vanished');
  return frame;
}

async function knownChannels(tx: pg.PoolClient, kind: LaKind, refId: string): Promise<ChannelBook> {
  const { rows } = await tx.query<{ env: string; bundle_id: string; apns_channel_id: string }>(
    `SELECT env, bundle_id, apns_channel_id FROM broadcast_channels
      WHERE kind = $1 AND ref_id = $2 AND deleted_at IS NULL AND apns_channel_id IS NOT NULL`,
    [kind, refId],
  );
  return new Map(rows.map((row) => [`${row.env}:${row.bundle_id}`, row.apns_channel_id]));
}

async function record(
  pool: pg.Pool,
  kind: LaKind,
  refId: string,
  outcomes: readonly LaSendOutcome[],
  now: Date,
): Promise<void> {
  await withSystem(pool, async (tx) => {
    for (const { send, result, channelId } of outcomes) {
      if (send.via === 'start' && result.outcome === 'sent' && channelId !== undefined) {
        await tx.query(
          `INSERT INTO broadcast_channels (kind, ref_id, env, bundle_id, apns_channel_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (kind, ref_id, env, bundle_id) DO UPDATE
             SET apns_channel_id = EXCLUDED.apns_channel_id, deleted_at = NULL, delete_after = NULL`,
          [kind, refId, send.env, send.bundleId, channelId],
        );
        await tx.query(
          `UPDATE device_activities SET broadcast_channel_id =
             (SELECT id FROM broadcast_channels WHERE apns_channel_id = $2) WHERE id = $1`,
          [send.rowId, channelId],
        );
      }
      if (result.outcome === 'sent' || send.via === 'broadcast') continue;
      if (send.via === 'start' || (send.via === 'fcm' && send.event === 'start')) {
        await tx.query(
          `UPDATE device_activities SET state = 'ended', ended_at = $2, end_reason = 'start_failed'
            WHERE id = $1 AND state = 'pending'`,
          [send.rowId, now],
        );
        if (send.via === 'start' && result.outcome === 'invalid_token') {
          await tx.query(
            `UPDATE la_push_to_start_tokens SET invalid_at = $2, invalid_reason = $3
              WHERE token = $1 AND invalid_at IS NULL`,
            [send.token, now, result.reason.slice(0, 120)],
          );
        }
      } else if (send.via === 'token' && result.outcome === 'invalid_token') {
        // The activity is gone on the phone (ended or its token rotated).
        await tx.query(
          `UPDATE device_activities SET state = 'ended', ended_at = $2, end_reason = 'token_gone'
            WHERE id = $1 AND state IN ('pending', 'active', 'stale')`,
          [send.rowId, now],
        );
      }
    }
  });
}

interface Planned {
  readonly sends: LaSend[];
  readonly book: ChannelBook;
  readonly fallbacks: number;
}

/** Ends what an object shows everywhere and marks it ended (the loader says it is over). */
async function endObject(
  tx: pg.PoolClient,
  kind: LaKind,
  refId: string,
  locked: Frame | null,
  snapshot: LaSnapshot | null,
  now: Date,
): Promise<LaSend[] | null> {
  const rows = await liveRows(tx, kind, refId);
  // Never shown (or already ended with nothing left on screen): nothing to do.
  if (
    rows.length === 0 &&
    (locked === null || locked.phase === 'ended' || locked.last_state === null)
  ) {
    return null;
  }
  const seq = (locked?.seq ?? 0) + 1;
  const final = snapshot?.state(seq) ?? locked?.last_state ?? { seq };
  const dismissAt = new Date(now.getTime() + (snapshot?.lingerMs ?? 0));
  const sends = endSends(rows, final, dismissAt, 100 - LA_KIND_SPECS[kind].rank * 10);
  await markEnded(
    tx,
    rows.map((row) => row.id),
    'object_ended',
    now,
  );
  await tx.query(
    `UPDATE la_object_states SET seq = $3, phase = 'ended', last_state = $4, ended_at = $5,
       trip_id = coalesce(trip_id, $6)
      WHERE kind = $1 AND ref_id = $2`,
    [kind, refId, seq, JSON.stringify(final), now, snapshot?.tripId ?? null],
  );
  await tx.query(
    `UPDATE broadcast_channels SET delete_after = $3
      WHERE kind = $1 AND ref_id = $2 AND deleted_at IS NULL`,
    [kind, refId, new Date(dismissAt.getTime() + 5 * 60_000)],
  );
  return sends;
}

async function send(
  pool: pg.Pool,
  deps: LaDeps,
  kind: LaKind,
  refId: string,
  planned: Planned,
  now: Date,
): Promise<{ sends: number; failed: number }> {
  if (planned.sends.length === 0) return { sends: 0, failed: 0 };
  const outcomes = await deliverAll(deps, planned.book, planned.sends);
  await record(pool, kind, refId, outcomes, now);
  return {
    sends: outcomes.length,
    failed: outcomes.filter((o) => o.result.outcome !== 'sent').length,
  };
}

/**
 * The kill switch is off: no start, update or broadcast frame goes out. Whatever this object
 * still shows ends once, on its last frame, so nothing lingers with stale content; the object
 * stays as it is and resumes (fresh starts) when the switch comes back on.
 */
async function switchedOff(
  pool: pg.Pool,
  deps: LaDeps,
  kind: LaKind,
  refId: string,
  now: Date,
): Promise<LaRunOutcome> {
  const planned = await withSystem(pool, async (tx) => {
    const locked = await lockFrame(tx, kind, refId);
    const rows = await liveRows(tx, kind, refId);
    if (rows.length === 0) return null;
    await markEnded(
      tx,
      rows.map((row) => row.id),
      'switched_off',
      now,
    );
    const last = locked?.last_state;
    const sends =
      last === null || last === undefined
        ? []
        : endSends(rows, last, now, 100 - LA_KIND_SPECS[kind].rank * 10);
    return { sends, book: await knownChannels(tx, kind, refId), fallbacks: 0, ended: rows.length };
  });
  if (planned === null) return { outcome: 'switched_off', ended: 0 };
  await send(pool, deps, kind, refId, planned, now);
  return { outcome: 'switched_off', ended: planned.ended };
}

/**
 * The object as its lock screens may show it. A Live Activity's frames and alerts go to the whole
 * audience at once (one broadcast channel), so when anyone on it hides details on the lock screen
 * (`user_settings.hide_lockscreen_details`), everyone's copy leaves out exact places.
 */
async function loadForLockScreens(
  tx: pg.PoolClient,
  loader: LaLoader,
  refId: string,
  now: Date,
  render: LaRender,
): Promise<{ snapshot: LaSnapshot | null; render: LaRender }> {
  const plain = await loader({ tx, refId, now, render });
  if (plain === null || plain.audience.length === 0) return { snapshot: plain, render };
  const { rows } = await tx.query<{ hides: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM user_settings
                     WHERE user_id = ANY($1::uuid[]) AND hide_lockscreen_details) AS hides`,
    [plain.audience],
  );
  if (rows[0]?.hides !== true) return { snapshot: plain, render };
  const redacted: LaRender = (locale, copy, vars) =>
    render(locale, lockscreenCopy(copy, true), vars);
  return {
    snapshot: await loader({ tx, refId, now, render: redacted, redact: true }),
    render: redacted,
  };
}

/** One orchestrator run for one object. */
export async function orchestrateObject(
  pool: pg.Pool,
  deps: LaDeps,
  kind: LaKind,
  refId: string,
): Promise<LaRunOutcome> {
  const now = deps.now?.() ?? new Date();
  if (!(await deps.switches.isOn(`la.${kind}.enabled`))) {
    return switchedOff(pool, deps, kind, refId, now);
  }
  const loader = deps.loaders[kind];
  if (loader === undefined) return { outcome: 'no_loader' };
  const spec = LA_KIND_SPECS[kind];

  const planned = await withSystem(pool, async (tx): Promise<Planned | null> => {
    const locked = await lockFrame(tx, kind, refId);
    const { snapshot, render } = await loadForLockScreens(tx, loader, refId, now, deps.render);
    const book = await knownChannels(tx, kind, refId);
    if (snapshot === null || !snapshot.live) {
      const sends = await endObject(tx, kind, refId, locked, snapshot, now);
      return sends === null ? null : { sends, book, fallbacks: 0 };
    }
    const frame = locked ?? (await createFrame(tx, kind, refId));
    const plan = await planLive({
      tx,
      kind,
      refId,
      snapshot,
      prev: frame.last_state,
      seq: frame.seq,
      render,
      now,
      defaultBundleId: deps.defaultBundleId,
    });
    await tx.query(
      `UPDATE la_object_states SET seq = $3, phase = 'live', last_state = $4, ended_at = NULL,
         trip_id = $5 WHERE kind = $1 AND ref_id = $2`,
      [kind, refId, plan.seq, JSON.stringify(plan.frame), snapshot.tripId],
    );
    const touched = plan.sends.flatMap((s) => ('rowId' in s ? [s.rowId] : []));
    const onChannel = plan.sends.some((s) => s.via === 'broadcast');
    await tx.query(
      `UPDATE device_activities
          SET last_content_version = $3, last_sent_at = $4, stale_at = $5,
              state = CASE WHEN state = 'stale' THEN 'active' ELSE state END
        WHERE kind = $1 AND ref_id = $2 AND state IN ('pending', 'active', 'stale')
          AND (id = ANY($6::uuid[]) OR ($7 AND broadcast_channel_id IS NOT NULL))`,
      [kind, refId, plan.seq, now, new Date(now.getTime() + spec.staleAfterMs), touched, onChannel],
    );
    return { sends: plan.sends, book, fallbacks: plan.fallbacks };
  });
  if (planned === null) return { outcome: 'idle' };
  const sent = await send(pool, deps, kind, refId, planned, now);
  return { outcome: 'sent', ...sent, fallbacks: planned.fallbacks };
}

export function laOrchestrateJob(deps: LaDeps): JobDefinition<{ kind: LaKind; ref_id: string }> {
  return defineJob({
    queue: LA_QUEUES.orchestrate,
    schema: laOrchestrateJobSchema,
    singletonKey: laOrchestrateSingletonKey,
    concurrency: 4,
    handler: async (data, ctx) => ({
      ...(await orchestrateObject(ctx.pool, deps, data.kind, data.ref_id)),
    }),
  });
}
