/**
 * The `rt_outbox` relay (docs/system-architecture.md §4.3, docs/api-contracts-async.md §1.1
 * "Delivery", "Revocation"): rows are written inside command transactions, so the relay only ever
 * sees committed rows. A batch is claimed with `FOR UPDATE SKIP LOCKED` and stays locked while its
 * Centrifugo calls run, so two relay instances can never send the same row; every row is then
 * marked sent, or its `attempts` bumped with a backoff measured from `created_at`. After
 * `RT_RELAY_MAX_ATTEMPTS` a row is left in place for the dead-letter job.
 */
import { withSystem } from '@cp/db';
import {
  channelName,
  parseRtChannel,
  RT_CREW_SCOPED_NAMESPACES,
  RT_TRIP_SCOPED_NAMESPACES,
  rtUserPayloadSchema,
  toRtEnvelope,
  type RtEnvelope,
} from '@cp/domain';
import type pg from 'pg';

import { CentrifugoApiError, type CentrifugoApi } from './centrifugo-api';

export const RT_RELAY_MAX_ATTEMPTS = 10;
export const RT_RELAY_BATCH_SIZE = 100;

/**
 * Seconds after `created_at` before retry n (index = attempts so far): per-retry delays of
 * 0.25 s doubling to a 30 s cap, accumulated so every relay instance agrees without extra state.
 */
const RETRY_AFTER_SECONDS: readonly number[] = (() => {
  const schedule = [0];
  let total = 0;
  for (let attempt = 1; attempt < RT_RELAY_MAX_ATTEMPTS; attempt += 1) {
    total += Math.min(0.25 * 2 ** (attempt - 1), 30);
    schedule.push(total);
  }
  return schedule;
})();

export interface OutboxRow {
  readonly id: string;
  readonly channel: string;
  readonly payload: unknown;
  readonly idem_key: string;
  readonly kind: 'publish' | 'unsubscribe' | 'disconnect';
  readonly created_at: Date;
}

type Outcome = 'sent' | 'retry' | 'dead';

export interface RelayLogger {
  warn(details: object, message: string): void;
  error(details: object, message: string): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringField(payload: unknown, field: string): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}

/**
 * A membership row names the crew's or trip's primary channel; the member loses every channel keyed
 * by the same id (crew chat, money, trip plan, presence, ...).
 */
export function revocationChannels(channel: string): readonly string[] {
  const parsed = parseRtChannel(channel);
  if (parsed?.namespace === 'crew') {
    return RT_CREW_SCOPED_NAMESPACES.map((namespace) => channelName(namespace, parsed.id));
  }
  if (parsed?.namespace === 'trip') {
    return RT_TRIP_SCOPED_NAMESPACES.map((namespace) => channelName(namespace, parsed.id));
  }
  return [channel];
}

/** The wire envelope for a publish row, or `null` when the row can never be published. */
export function envelopeFor(row: OutboxRow): RtEnvelope | null {
  const checked = toRtEnvelope(row.payload, {
    id: row.idem_key,
    at: row.created_at.toISOString(),
  });
  if (!checked.ok) return null;
  const parsed = parseRtChannel(row.channel);
  if (parsed?.namespace === 'user') {
    const schema = rtUserPayloadSchema(checked.envelope.type);
    if (schema !== undefined && !schema.safeParse(checked.envelope.data).success) return null;
  }
  return checked.envelope;
}

function outcomeOf(error: unknown): Outcome {
  return error instanceof CentrifugoApiError && !error.retryable ? 'dead' : 'retry';
}

export interface RelayBatchResult {
  readonly outcomes: ReadonlyMap<string, Outcome>;
  readonly failures: readonly { readonly id: string; readonly error: unknown }[];
  /** A retryable failure stopped the batch; rows without an outcome were never attempted. */
  readonly halted: boolean;
}

export class RelayBatch {
  private readonly outcomes = new Map<string, Outcome>();
  private readonly failures: { readonly id: string; readonly error: unknown }[] = [];
  private halted = false;

  constructor(
    private readonly api: CentrifugoApi,
    private readonly rows: readonly OutboxRow[],
  ) {}

  private settle(id: string, outcome: Outcome, error?: unknown): void {
    this.outcomes.set(id, outcome);
    if (error !== undefined) this.failures.push({ id, error });
    // Centrifugo is down or overloaded: stop here instead of waiting out a timeout per row. The
    // untouched rows keep their attempts and are claimed again on the next sweep.
    if (outcome === 'retry') this.halted = true;
  }

  /**
   * Sends rows in id order; never throws. Every attempted row ends with exactly one outcome; after
   * a retryable failure the rest of the batch is left unattempted.
   */
  async run(): Promise<RelayBatchResult> {
    const publishGroups = new Map<string, { envelope: RtEnvelope; rows: OutboxRow[] }>();
    for (const row of this.rows) {
      if (row.kind !== 'publish') continue;
      const envelope = envelopeFor(row);
      if (envelope === null) {
        this.settle(row.id, 'dead', new Error('payload is not a valid realtime envelope'));
        continue;
      }
      const group = publishGroups.get(envelope.id);
      if (group === undefined) publishGroups.set(envelope.id, { envelope, rows: [row] });
      else group.rows.push(row);
    }

    for (const row of this.rows) {
      if (this.halted) break;
      if (this.outcomes.has(row.id)) continue;
      if (row.kind === 'publish') {
        const envelope = envelopeFor(row);
        const group = envelope === null ? undefined : publishGroups.get(envelope.id);
        if (group !== undefined) await this.sendGroup(group.envelope, group.rows);
      } else if (row.kind === 'unsubscribe') {
        await this.unsubscribe(row);
      } else {
        await this.disconnect(row);
      }
    }
    return { outcomes: this.outcomes, failures: this.failures, halted: this.halted };
  }

  /** One event fanned out to several channels shares its envelope id: one `broadcast` call. */
  private async sendGroup(envelope: RtEnvelope, rows: readonly OutboxRow[]): Promise<void> {
    const [first] = rows;
    if (first === undefined) return;
    try {
      if (rows.length === 1) {
        await this.api.publish(first.channel, envelope, first.idem_key);
        this.settle(first.id, 'sent');
        return;
      }
      const { errors } = await this.api.broadcast(
        rows.map((row) => row.channel),
        envelope,
        envelope.id,
      );
      rows.forEach((row, index) => {
        const error = errors[index] ?? null;
        if (error === null) this.settle(row.id, 'sent');
        else this.settle(row.id, outcomeOf(error), error);
      });
    } catch (error) {
      for (const row of rows) this.settle(row.id, outcomeOf(error), error);
    }
  }

  private async unsubscribe(row: OutboxRow): Promise<void> {
    const user = stringField(row.payload, 'user_id');
    if (user === undefined || !UUID.test(user)) {
      this.settle(row.id, 'dead', new Error('unsubscribe row has no user_id'));
      return;
    }
    try {
      for (const channel of revocationChannels(row.channel)) {
        await this.api.unsubscribe(user, channel);
      }
      this.settle(row.id, 'sent');
    } catch (error) {
      this.settle(row.id, outcomeOf(error), error);
    }
  }

  private async disconnect(row: OutboxRow): Promise<void> {
    const parsed = parseRtChannel(row.channel);
    const user =
      stringField(row.payload, 'user_id') ?? (parsed?.namespace === 'user' ? parsed.id : undefined);
    if (user === undefined || !UUID.test(user)) {
      this.settle(row.id, 'dead', new Error('disconnect row names no user'));
      return;
    }
    try {
      await this.api.disconnect(user, stringField(row.payload, 'type') ?? 'revoked');
      this.settle(row.id, 'sent');
    } catch (error) {
      this.settle(row.id, outcomeOf(error), error);
    }
  }
}

const DUE_WHERE = `
  WHERE published_at IS NULL
    AND attempts < $1
    AND created_at + make_interval(secs => ($2::float8[])[attempts + 1]) <= now()`;

const CLAIM_SQL = `
  SELECT id::text AS id, channel, payload, idem_key::text AS idem_key, kind, created_at
  FROM rt_outbox ${DUE_WHERE}
  ORDER BY id
  LIMIT $3
  FOR UPDATE SKIP LOCKED`;

/** Whether any row is due for a send now (the sweep's cheap check before enqueueing a drain). */
export async function hasDueRows(tx: pg.PoolClient): Promise<boolean> {
  const { rows } = await tx.query<{ due: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM rt_outbox ${DUE_WHERE}) AS due`,
    [RT_RELAY_MAX_ATTEMPTS, RETRY_AFTER_SECONDS],
  );
  return rows[0]?.due === true;
}

export interface RelayOnceResult {
  readonly claimed: number;
  readonly halted: boolean;
}

/**
 * Claims, sends and settles one batch in a single `app_system` transaction. The backlog is drained
 * when fewer rows than the batch size were claimed; `halted` means stop until the next sweep.
 */
export async function relayOnce(
  pool: pg.Pool,
  api: CentrifugoApi,
  logger: RelayLogger,
  batchSize: number = RT_RELAY_BATCH_SIZE,
): Promise<RelayOnceResult> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<OutboxRow>(CLAIM_SQL, [
      RT_RELAY_MAX_ATTEMPTS,
      RETRY_AFTER_SECONDS,
      batchSize,
    ]);
    if (rows.length === 0) return { claimed: 0, halted: false };

    const { outcomes, failures, halted } = await new RelayBatch(api, rows).run();
    const idsWith = (wanted: Outcome) =>
      [...outcomes].filter(([, outcome]) => outcome === wanted).map(([id]) => id);

    await tx.query('UPDATE rt_outbox SET published_at = now() WHERE id = ANY($1::bigint[])', [
      idsWith('sent'),
    ]);
    await tx.query('UPDATE rt_outbox SET attempts = attempts + 1 WHERE id = ANY($1::bigint[])', [
      idsWith('retry'),
    ]);
    await tx.query('UPDATE rt_outbox SET attempts = $2 WHERE id = ANY($1::bigint[])', [
      idsWith('dead'),
      RT_RELAY_MAX_ATTEMPTS,
    ]);

    for (const { id, error } of failures) {
      const details = { outbox_id: id, err: error };
      if (outcomes.get(id) === 'dead') logger.error(details, 'rt_outbox row cannot be relayed');
      else logger.warn(details, 'rt_outbox row relay failed, will retry');
    }
    return { claimed: rows.length, halted };
  });
}
