/**
 * The two same-transaction side channels a command handler writes besides its own aggregates
 * (docs/api-contracts.md §2.3 step 6): realtime hints on `rt_outbox` and `domain_events`. Both run
 * in the caller's transaction, so a handler that later throws leaves neither behind, and the relay
 * only ever sees committed rows.
 */
import { generateUuidV7, type DomainEventInput } from '@cp/domain';
import type pg from 'pg';

import { appendDomainEvent, enqueueRealtime, type AppendedDomainEvent } from '../events';

/** Envelope version of every realtime hint (`{v, id, type, at, data}`, system-architecture §4.3). */
export const REALTIME_ENVELOPE_VERSION = 1;

/** Centrifugo publications stay small; anything larger belongs in a synced row, not a hint. */
export const MAX_REALTIME_ENVELOPE_BYTES = 8 * 1024;

export interface RealtimeEnvelope<Data> {
  readonly v: typeof REALTIME_ENVELOPE_VERSION;
  /** UUIDv7; clients dedupe on it. */
  readonly id: string;
  readonly type: string;
  readonly at: string;
  readonly data: Data;
}

/**
 * Queues one realtime hint for `channel`, published by the relay only after this transaction
 * commits. Throws (rolling the command back) when the envelope exceeds 8 KB, since a truncated or
 * dropped hint would be a silent failure.
 */
export async function outbox<Data>(
  tx: pg.PoolClient,
  channel: string,
  type: string,
  data: Data,
): Promise<RealtimeEnvelope<Data>> {
  const envelope: RealtimeEnvelope<Data> = {
    v: REALTIME_ENVELOPE_VERSION,
    id: generateUuidV7(),
    type,
    at: new Date().toISOString(),
    data,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
  if (bytes > MAX_REALTIME_ENVELOPE_BYTES) {
    throw new Error(
      `realtime envelope ${type} on ${channel} is ${bytes} bytes (max ${MAX_REALTIME_ENVELOPE_BYTES})`,
    );
  }
  await enqueueRealtime(tx, { channel, payload: envelope });
  return envelope;
}

/** Appends one domain event in the caller's transaction (validated against the event catalogue). */
export function emitEvent(
  tx: pg.PoolClient,
  event: DomainEventInput,
): Promise<AppendedDomainEvent> {
  return appendDomainEvent(tx, event);
}
