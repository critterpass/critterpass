/**
 * The worker's stop on SIGTERM / SIGINT. Railway gives a draining container
 * `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` (30 s on the worker) before it kills it, so everything here
 * fits inside that: the job runtime and the other services start stopping at once (running jobs get
 * `STOP_JOB_TIMEOUT_MS` to finish, then pg-boss fails them back to their queue for another
 * instance), the health server closes alongside, its keep-alive connections dropped so they cannot
 * hold the stop, and a hard exit at `HARD_EXIT_MS` ends a stop that still hangs.
 *
 * Stopping only after the health server had closed let one open keep-alive health check hold the
 * job runtime past the kill: a job in flight then stayed `active` until its expiry (ten minutes)
 * before anything retried it.
 */
export const STOP_JOB_TIMEOUT_MS = 20_000;
export const HARD_EXIT_MS = 27_000;

export interface ClosableServer {
  close(callback?: (error?: Error) => void): unknown;
  closeAllConnections?(): void;
}

export interface ShutdownLogger {
  info(object: object, message?: string): void;
  info(message: string): void;
  error(object: object, message?: string): void;
}

export interface ShutdownPlan {
  readonly server: ClosableServer;
  /** Resolves once the services the steps stop have started (stopping earlier would race them). */
  readonly started: Promise<unknown>;
  /** Run one after another, at once on the signal: relays, exporters, the job runtime, push. */
  readonly stops: readonly (() => unknown)[];
  /** Run together after the stops: pools, clients, error flushes. */
  readonly closes: readonly (() => unknown)[];
  /** Synchronous stops taken before anything else (timers, heartbeats). */
  readonly immediate?: readonly (() => void)[];
  readonly logger: ShutdownLogger;
  readonly exit: (code: number) => void;
  readonly hardExitMs?: number;
}

function closeServer(server: ClosableServer): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    // Idle and in-flight keep-alive sockets would otherwise keep `close` waiting.
    server.closeAllConnections?.();
  });
}

/** Returns the signal handler; a second signal while stopping is ignored. */
export function createShutdown(plan: ShutdownPlan): (signal: string) => Promise<void> {
  let stopping: Promise<void> | undefined;
  return (signal) => {
    if (stopping !== undefined) return stopping;
    plan.logger.info({ signal }, 'draining');
    setTimeout(() => plan.exit(1), plan.hardExitMs ?? HARD_EXIT_MS).unref();
    for (const stop of plan.immediate ?? []) stop();
    const serverClosed = closeServer(plan.server);
    const services = plan.started
      .catch(() => undefined)
      .then(async () => {
        for (const stop of plan.stops) await stop();
      })
      .catch((error: unknown) => plan.logger.error({ err: error }, 'job runtime stop failed'));
    stopping = Promise.all([serverClosed, services])
      .then(() => Promise.allSettled(plan.closes.map((close) => close())))
      .then(() => {
        plan.logger.info('stopped');
        plan.exit(0);
      });
    return stopping;
  };
}
