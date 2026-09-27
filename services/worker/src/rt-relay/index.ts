/**
 * The `rt_outbox` relay (./relay.ts) as the pg-boss `rt.relay` job (docs/api-contracts-async.md
 * §2.2). One drain runs at a time across every worker instance (queue policy `stately`: one active,
 * one queued), so a burst of wakes collapses into at most one follow-up drain. Wakes come from
 * `LISTEN rt_outbox` (the insert trigger's NOTIFY fires at commit) and from a 1 s sweep that only
 * enqueues when rows are due, which catches anything a dropped listener connection missed plus rows
 * whose retry backoff has elapsed.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../boss/define-job';
import type { CentrifugoApi } from './centrifugo-api';
import { hasDueRows, relayOnce, RT_RELAY_BATCH_SIZE, type RelayLogger } from './relay';

export {
  CentrifugoApiError,
  createCentrifugoApi,
  DISCONNECT_RECONNECT_CODE,
  type CentrifugoApi,
} from './centrifugo-api';
export {
  envelopeFor,
  hasDueRows,
  RelayBatch,
  relayOnce,
  revocationChannels,
  RT_RELAY_BATCH_SIZE,
  RT_RELAY_MAX_ATTEMPTS,
  type OutboxRow,
  type RelayLogger,
} from './relay';

export const RT_OUTBOX_NOTIFY_CHANNEL = 'rt_outbox';
export const RT_RELAY_QUEUE = 'rt.relay';

/** The `rt.relay` job: drains due outbox rows batch by batch until the backlog is empty. */
export function rtRelayJob(
  api: CentrifugoApi,
  batchSize: number = RT_RELAY_BATCH_SIZE,
): AnyJobDefinition {
  return defineJob({
    queue: RT_RELAY_QUEUE,
    schema: z.object({}).nullish(),
    pollingIntervalSeconds: 1,
    async handler(_data, { pool, logger, job }) {
      let relayed = 0;
      while (!job.signal.aborted) {
        const { claimed, halted } = await relayOnce(pool, api, logger, batchSize);
        relayed += claimed;
        if (halted || claimed < batchSize) break;
      }
      return { relayed };
    },
  });
}

export interface RtRelayWakeOptions {
  readonly pool: pg.Pool;
  readonly boss: Pick<PgBoss, 'send'>;
  readonly logger: RelayLogger & { info(details: object, message: string): void };
  /** Opens a dedicated, unpooled connection for `LISTEN` (a direct URL: PgBouncer drops it). */
  readonly connectListener: () => pg.Client;
  readonly sweepIntervalMs?: number;
}

export interface RtRelay {
  /** Enqueues a drain now (a NOTIFY does this; exposed for callers that know rows just landed). */
  wake(): void;
  /** Stops listening and sweeping, then waits for a pending enqueue to settle. */
  stop(): Promise<void>;
}

const LISTENER_RETRY_MS = 1000;

export function startRtRelayWake(options: RtRelayWakeOptions): RtRelay {
  const sweepIntervalMs = options.sweepIntervalMs ?? 1000;
  let stopped = false;
  let sending: Promise<void> | undefined;
  let sendAgain = false;
  let sweeping = false;
  let listener: pg.Client | undefined;
  let listenerRetry: NodeJS.Timeout | undefined;

  function wake(): void {
    if (stopped) return;
    if (sending !== undefined) {
      sendAgain = true;
      return;
    }
    sending = options.boss
      .send(RT_RELAY_QUEUE, null)
      .then(() => undefined)
      .catch((error: unknown) => options.logger.error({ err: error }, 'rt relay enqueue failed'))
      .finally(() => {
        sending = undefined;
        if (sendAgain) {
          sendAgain = false;
          wake();
        }
      });
  }

  function sweep(): void {
    if (stopped || sweeping) return;
    sweeping = true;
    void withSystem(options.pool, (tx) => hasDueRows(tx))
      .then((due) => {
        if (due) wake();
      })
      .catch((error: unknown) => options.logger.warn({ err: error }, 'rt relay sweep failed'))
      .finally(() => {
        sweeping = false;
      });
  }

  function scheduleListenerRetry(): void {
    if (stopped || listenerRetry !== undefined) return;
    listenerRetry = setTimeout(() => {
      listenerRetry = undefined;
      void listen();
    }, LISTENER_RETRY_MS);
  }

  async function listen(): Promise<void> {
    const client = options.connectListener();
    listener = client;
    client.on('notification', () => wake());
    client.on('error', (error: unknown) => {
      options.logger.warn({ err: error }, 'rt relay listener connection failed');
      void client.end().catch(() => undefined);
    });
    client.on('end', () => {
      if (listener === client) listener = undefined;
      scheduleListenerRetry();
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${RT_OUTBOX_NOTIFY_CHANNEL}`);
      if (stopped) await client.end();
      else sweep();
    } catch (error) {
      options.logger.warn({ err: error }, 'rt relay could not LISTEN; sweeping only');
      await client.end().catch(() => undefined);
    }
  }

  const timer = setInterval(sweep, sweepIntervalMs);
  void listen();
  sweep();
  options.logger.info({ sweep_ms: sweepIntervalMs }, 'rt relay wake started');

  return {
    wake,
    async stop() {
      stopped = true;
      clearInterval(timer);
      if (listenerRetry !== undefined) clearTimeout(listenerRetry);
      await listener?.end().catch(() => undefined);
      await sending;
    },
  };
}
