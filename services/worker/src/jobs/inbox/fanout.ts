/**
 * `inbox.fanout` (docs/api-contracts-async.md §2.2): for one domain event, settle every open item
 * the event answers (a vote cast from a notification, an undo from the plan screen), then file one
 * item per recipient for every kind the event files, and refresh the badge counts of everyone
 * whose inbox changed. A replay files nothing twice: `(user_id, source_event_id)` is unique.
 */
import { outbox, sendInTx, withSystem } from '@cp/db';
import {
  inboxFanoutJobSchema,
  inboxKindsForEvent,
  inboxResolveKeysForEvent,
  INBOX_FANOUT_QUEUE,
  isInboxEvent,
  userChannel,
  type BadgeCounts,
  type InboxAction,
  type InboxFanoutJob,
  type InboxKindSpec,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';

export { INBOX_FANOUT_QUEUE };

export interface FanoutEvent {
  readonly id: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly crewId: string | null;
  readonly tripId: string | null;
  readonly actorId: string | null;
  readonly occurredAt: Date;
}

/** One recipient's item, before it is stored. */
export interface InboxItemDraft {
  readonly crewId?: string | null;
  readonly tripId?: string | null;
  readonly actorId?: string | null;
  readonly data: Readonly<Record<string, unknown>>;
  readonly actions?: readonly InboxAction[];
  readonly deepLink?: string | null;
  readonly expiresAt?: Date | null;
  readonly undoUntil?: Date | null;
  readonly resolveKey?: string | null;
}

export interface InboxFanoutRegistration {
  readonly kind: string;
  readonly audience: (tx: pg.PoolClient, event: FanoutEvent) => Promise<readonly string[]>;
  /** `null` files nothing for this recipient. */
  readonly build: (
    tx: pg.PoolClient,
    event: FanoutEvent,
    uid: string,
  ) => Promise<InboxItemDraft | null>;
}

const registrations = new Map<string, InboxFanoutRegistration>();

/** Registers who receives a kind and what each item carries (the kind itself is in @cp/domain). */
export function registerInboxFanout(registration: InboxFanoutRegistration): void {
  if (registrations.has(registration.kind)) {
    throw new Error(`inbox fan-out for ${registration.kind} is already registered`);
  }
  registrations.set(registration.kind, registration);
}

/** `onEventAppended` hook: an event that files or settles inbox items gets one fan-out job. */
export async function inboxEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string },
): Promise<void> {
  if (!isInboxEvent(event.type)) return;
  const job: InboxFanoutJob = { event_id: event.id };
  await sendInTx(tx, INBOX_FANOUT_QUEUE, job, { singletonKey: event.id });
}

async function loadEvent(tx: pg.PoolClient, id: string): Promise<FanoutEvent | undefined> {
  const { rows } = await tx.query<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
    crew_id: string | null;
    trip_id: string | null;
    actor_id: string | null;
    occurred_at: Date;
  }>('SELECT * FROM app.domain_event_for_routing($1)', [id]);
  const row = rows[0];
  if (row === undefined) return undefined;
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    crewId: row.crew_id,
    tripId: row.trip_id,
    actorId: row.actor_id,
    occurredAt: row.occurred_at,
  };
}

/** Reads one user's badge counts and publishes them on `user:#uid`. */
export async function publishBadgeCounts(
  tx: pg.PoolClient,
  uid: string,
  now: Date,
): Promise<BadgeCounts> {
  const { rows } = await tx.query<BadgeCounts>(
    'SELECT needs_you, unread FROM app.inbox_badge_counts($1, $2)',
    [uid, now],
  );
  const counts = rows[0] ?? { needs_you: 0, unread: 0 };
  await outbox(tx, userChannel(uid), 'badge.counts', counts);
  return counts;
}

async function fileItem(
  tx: pg.PoolClient,
  spec: InboxKindSpec,
  event: FanoutEvent,
  uid: string,
  draft: InboxItemDraft,
): Promise<string | undefined> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO inbox_items (user_id, crew_id, trip_id, kind, source, actor_id, source_event_id,
       resolve_key, data, needs_you, actions, deep_link, expires_at, undo_until, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (user_id, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      uid,
      draft.crewId === undefined ? event.crewId : draft.crewId,
      draft.tripId === undefined ? event.tripId : draft.tripId,
      spec.kind,
      spec.source,
      draft.actorId === undefined ? event.actorId : draft.actorId,
      event.id,
      draft.resolveKey ?? null,
      JSON.stringify(draft.data),
      spec.needsYou,
      JSON.stringify(draft.actions ?? []),
      draft.deepLink ?? null,
      draft.expiresAt ?? null,
      draft.undoUntil ?? null,
      event.occurredAt,
    ],
  );
  return rows[0]?.id;
}

export interface FanoutOutcome {
  readonly resolved: number;
  readonly filed: number;
}

export async function fanOutEvent(
  pool: pg.Pool,
  eventId: string,
  now: Date = new Date(),
): Promise<FanoutOutcome> {
  return withSystem(pool, async (tx) => {
    const event = await loadEvent(tx, eventId);
    if (event === undefined) return { resolved: 0, filed: 0 };
    const touched = new Set<string>();

    const keys = inboxResolveKeysForEvent(event.type, event.payload);
    let resolved = 0;
    if (keys.length > 0) {
      const settled = await tx.query<{ id: string; user_id: string }>(
        'SELECT id, user_id FROM app.resolve_inbox_items($1, $2)',
        [keys, now],
      );
      for (const row of settled.rows) {
        touched.add(row.user_id);
        await outbox(tx, userChannel(row.user_id), 'inbox.item_resolved', { item_id: row.id });
      }
      resolved = settled.rowCount ?? 0;
    }

    let filed = 0;
    for (const spec of inboxKindsForEvent(event.type)) {
      const registration = registrations.get(spec.kind);
      if (registration === undefined) continue;
      for (const uid of new Set(await registration.audience(tx, event))) {
        const draft = await registration.build(tx, event, uid);
        if (draft === null) continue;
        const id = await fileItem(tx, spec, event, uid, draft);
        if (id === undefined) continue;
        filed += 1;
        touched.add(uid);
        await outbox(tx, userChannel(uid), 'inbox.item_created', {
          item_id: id,
          kind: spec.kind,
          needs_you: spec.needsYou,
        });
      }
    }

    for (const uid of touched) await publishBadgeCounts(tx, uid, now);
    return { resolved, filed };
  });
}

export function inboxFanoutJob(): JobDefinition<InboxFanoutJob> {
  return defineJob({
    queue: INBOX_FANOUT_QUEUE,
    schema: inboxFanoutJobSchema,
    singletonKey: (data: InboxFanoutJob) => data.event_id,
    concurrency: 4,
    handler: async (data, ctx) => ({ ...(await fanOutEvent(ctx.pool, data.event_id)) }),
  });
}

/** Test-only: forget every fan-out registration. */
export function resetInboxFanoutsForTests(): void {
  registrations.clear();
}
