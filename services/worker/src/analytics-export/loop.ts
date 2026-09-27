/**
 * The export loop: one pass every 30 s (immediately again while a full batch came back), with
 * exponential backoff after failures. Several workers may run it; the advisory lock in
 * `exportDomainEvents` lets only one export at a time.
 */
import { exportDomainEvents, type ExportOptions, type ExportResult } from './exporter';

export interface ExportLoopOptions extends ExportOptions {
  readonly intervalMs?: number;
  readonly maxBackoffMs?: number;
  readonly onError?: (error: unknown) => void;
  readonly onPass?: (result: ExportResult) => void;
}

export interface ExportLoop {
  stop(): Promise<void>;
}

export function startExportLoop(options: ExportLoopOptions): ExportLoop {
  const intervalMs = options.intervalMs ?? 30_000;
  const maxBackoffMs = options.maxBackoffMs ?? 10 * 60_000;
  const batchSize = options.batchSize ?? 500;
  let failures = 0;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      running = tick();
    }, delayMs);
    timer.unref();
  };

  const tick = async () => {
    try {
      const result = await exportDomainEvents(options);
      failures = 0;
      options.onPass?.(result);
      schedule(result.read >= batchSize ? 0 : intervalMs);
    } catch (error) {
      failures += 1;
      options.onError?.(error);
      schedule(Math.min(intervalMs * 2 ** (failures - 1), maxBackoffMs));
    }
  };

  schedule(0);
  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}
