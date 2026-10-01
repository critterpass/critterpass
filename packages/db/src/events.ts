/**
 * TS wrappers over the command-bookkeeping/event/outbox SECURITY DEFINER functions (docs/data-
 * model.md §3.18, docs/system-architecture.md §4.1, Transaction helpers table in the phase doc).
 * Every function here takes the already-open transaction client from `withUser`/`withSystem`
 * (packages/db/src/tx.ts); none of them opens its own transaction, so a caller's other writes in
 * the same tx commit or roll back together with these.
 */
import {
  checkRtPublication,
  type DomainEventInput,
  generateUuidV7,
  parseDomainEvent,
  projectActivity,
} from '@cp/domain';
import type pg from 'pg';

export type ClaimOpResult =
  | { readonly outcome: 'new' }
  | { readonly outcome: 'duplicate'; readonly result: unknown }
  | { readonly outcome: 'mismatch' };

export interface ClaimOpInput {
  readonly opId: string;
  readonly uid: string | null;
  readonly cmd: string;
  readonly payloadHash: string;
}

/**
 * `app.claim_op`: the `cmd_log` idempotency check (docs/api-contracts.md §2.3 step 3). Reports the
 * outcome; a `'mismatch'` (same op_id, different payload) is the caller's to turn into
 * `IDEMPOTENCY_MISMATCH` — this function only tells the fact.
 */
export async function claimOpId(tx: pg.PoolClient, input: ClaimOpInput): Promise<ClaimOpResult> {
  const { rows } = await tx.query<{ claim_op: ClaimOpResult }>(
    'SELECT app.claim_op($1, $2, $3, $4) AS claim_op',
    [input.opId, input.uid, input.cmd, input.payloadHash],
  );
  const row = rows[0];
  if (row === undefined) throw new Error('app.claim_op returned no row');
  return row.claim_op;
}

export interface RecordCmdResultInput {
  readonly opId: string;
  readonly uid: string;
  readonly cmd: string;
  readonly status: 'applied' | 'rejected' | 'duplicate';
  readonly code?: string;
  readonly detail?: unknown;
  readonly resultRef?: unknown;
}

/** `app.record_cmd_result`: writes `cmd_results` + `cmd_log.result` + a `user:#uid` `cmd.result` outbox row. */
export async function recordCmdResult(
  tx: pg.PoolClient,
  input: RecordCmdResultInput,
): Promise<void> {
  await tx.query('SELECT app.record_cmd_result($1, $2, $3, $4, $5, $6, $7)', [
    input.opId,
    input.uid,
    input.cmd,
    input.status,
    input.code ?? null,
    input.detail === undefined ? null : JSON.stringify(input.detail),
    input.resultRef === undefined ? null : JSON.stringify(input.resultRef),
  ]);
}

export interface AppendedDomainEvent {
  readonly id: string;
  readonly type: DomainEventInput['type'];
  readonly tripId: string | null;
  readonly crewId: string | null;
}

type EventAppendedHook = (tx: pg.PoolClient, event: AppendedDomainEvent) => Promise<void>;

const eventAppendedHooks: EventAppendedHook[] = [];

/** Registers a same-tx hook a future job runner calls after every appended domain event. */
export function onEventAppended(hook: EventAppendedHook): void {
  eventAppendedHooks.push(hook);
}

/** Test-only: clears every registered hook so one test file's registrations cannot leak into another. */
export function resetEventAppendedHooksForTests(): void {
  eventAppendedHooks.length = 0;
}

/**
 * `app.append_event` + (when `projectActivity` maps the type) `app.append_activity`, then every
 * registered `onEventAppended` hook, all in the caller's transaction (docs/system-architecture.md
 * §4.1 step 6: consumers enqueue in the same transaction the event was written in).
 */
export async function appendDomainEvent(
  tx: pg.PoolClient,
  input: DomainEventInput,
): Promise<AppendedDomainEvent> {
  const validated = parseDomainEvent(input);
  const { rows } = await tx.query<{ append_event: string }>(
    'SELECT app.append_event($1, $2, $3, $4, $5, $6, $7, $8) AS append_event',
    [
      validated.type,
      validated.aggregateKind,
      validated.aggregateId,
      validated.actorKind,
      validated.actorId,
      JSON.stringify(validated.payload),
      validated.crewId ?? null,
      validated.tripId ?? null,
    ],
  );
  const row = rows[0];
  if (row === undefined) throw new Error('app.append_event returned no row');

  const appended: AppendedDomainEvent = {
    id: row.append_event,
    type: validated.type,
    tripId: validated.tripId ?? null,
    crewId: validated.crewId ?? null,
  };

  const projection = projectActivity(validated.type);
  if (projection !== null && appended.tripId !== null && appended.crewId !== null) {
    await tx.query('SELECT app.append_activity($1, $2, $3, $4, $5, $6, $7, $8)', [
      appended.tripId,
      appended.crewId,
      validated.actorKind,
      validated.actorId,
      projection.verb,
      projection.objectKind,
      validated.aggregateId,
      // Rendering copy is a later phase (i18n); the key itself is the interim `text` value.
      projection.textKey,
    ]);
  }

  for (const hook of eventAppendedHooks) {
    await hook(tx, appended);
  }

  return appended;
}

export type EnqueueRealtimeKind = 'publish' | 'unsubscribe' | 'disconnect';

export interface EnqueueRealtimeInput {
  readonly channel: string;
  readonly payload: unknown;
  readonly kind?: EnqueueRealtimeKind;
}

/**
 * `app.enqueue_rt`: the one `rt_outbox` write path open to a command handler. A publication the
 * relay could not deliver (bad envelope, oversized, or `data` that fails its `user:#uid` schema)
 * throws here, rolling the caller back, instead of being written and dead-lettered later.
 */
export async function enqueueRealtime(
  tx: pg.PoolClient,
  input: EnqueueRealtimeInput,
): Promise<{ readonly id: string }> {
  if ((input.kind ?? 'publish') === 'publish') {
    const checked = checkRtPublication(input.channel, input.payload, {
      id: generateUuidV7(),
      at: new Date().toISOString(),
    });
    if (!checked.ok) {
      throw new Error(
        `realtime payload on ${input.channel.split(':')[0] ?? ''} cannot be published: ${checked.reason}`,
      );
    }
  }
  const { rows } = await tx.query<{ enqueue_rt: string }>(
    'SELECT app.enqueue_rt($1, $2, $3) AS enqueue_rt',
    [input.channel, JSON.stringify(input.payload), input.kind ?? 'publish'],
  );
  const row = rows[0];
  if (row === undefined) throw new Error('app.enqueue_rt returned no row');
  return { id: row.enqueue_rt };
}
