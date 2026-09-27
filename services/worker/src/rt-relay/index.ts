/**
 * Runs the `rt_outbox` relay (./relay.ts) as a plain loop: woken by `LISTEN rt_outbox` (the insert
 * trigger's NOTIFY fires at commit) and by a 1 s sweep that catches anything a dropped listener
 * connection missed plus rows whose retry backoff has elapsed.
 */
import type pg from 'pg';

import type { CentrifugoApi } from './centrifugo-api';
import { relayOnce, RT_RELAY_BATCH_SIZE, type RelayLogger } from './relay';

export {
  CentrifugoApiError,
  createCentrifugoApi,
  DISCONNECT_RECONNECT_CODE,
  type CentrifugoApi,
} from './centrifugo-api';
export {
  envelopeFor,
  RelayBatch,
  relayOnce,
  revocationChannels,
  RT_RELAY_BATCH_SIZE,
  RT_RELAY_MAX_ATTEMPTS,
  type OutboxRow,
  type RelayLogger,
} from './relay';

export const RT_OUTBOX_NOTIFY_CHANNEL = 'rt_outbox';

export interface RtRelayOptions {
  readonly pool: pg.Pool;
  readonly api: CentrifugoApi;
  readonly logger: RelayLogger & { info(details: object, message: string): void };
  /** Opens a dedicated, unpooled connection for `LISTEN` (a direct URL: PgBouncer drops it). */
  readonly connectListener: () => pg.Client;
  readonly sweepIntervalMs?: number;
  readonly batchSize?: number;
}

export interface RtRelay {
  /** Wakes the relay now (a NOTIFY does this; exposed for callers that know rows just landed). */
  wake(): void;
  /** Stops listening and sweeping, then waits for the batch in flight to settle. */
  stop(): Promise<void>;
}

const LISTENER_RETRY_MS = 1000;

export function startRtRelay(options: RtRelayOptions): RtRelay {
  const sweepIntervalMs = options.sweepIntervalMs ?? 1000;
  const batchSize = options.batchSize ?? RT_RELAY_BATCH_SIZE;
  let stopped = false;
  let running: Promise<void> | undefined;
  let wakeAgain = false;
  let listener: pg.Client | undefined;
  let listenerRetry: NodeJS.Timeout | undefined;

  async function drain(): Promise<void> {
    do {
      wakeAgain = false;
      for (;;) {
        if (stopped) return;
        const { claimed, halted } = await relayOnce(
          options.pool,
          options.api,
          options.logger,
          batchSize,
        );
        if (halted || claimed < batchSize) break;
      }
    } while (wakeAgain && !stopped);
  }

  function wake(): void {
    if (stopped) return;
    if (running !== undefined) {
      wakeAgain = true;
      return;
    }
    running = drain()
      .catch((error: unknown) => options.logger.error({ err: error }, 'rt relay drain failed'))
      .finally(() => {
        running = undefined;
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
      else wake();
    } catch (error) {
      options.logger.warn({ err: error }, 'rt relay could not LISTEN; sweeping only');
      await client.end().catch(() => undefined);
    }
  }

  const sweep = setInterval(wake, sweepIntervalMs);
  void listen();
  wake();
  options.logger.info({ sweep_ms: sweepIntervalMs, batch: batchSize }, 'rt relay started');

  return {
    wake,
    async stop() {
      stopped = true;
      clearInterval(sweep);
      if (listenerRetry !== undefined) clearTimeout(listenerRetry);
      await listener?.end().catch(() => undefined);
      await running;
    },
  };
}
