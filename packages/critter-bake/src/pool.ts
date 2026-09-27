import { isMainThread, parentPort, Worker } from 'node:worker_threads';

import type { RenderJob, RenderOutput } from './render-job';
import { renderJob } from './render-job';

interface WorkerRequest {
  readonly requestId: number;
  readonly job: RenderJob;
}

interface WorkerResponse {
  readonly requestId: number;
  readonly outputs?: RenderOutput[];
  readonly error?: string;
}

// Worker mode: this same module is spawned as the worker script (see `runPool` below), so a single
// file serves as both the pool orchestrator (main thread) and the render worker (thread pool).
if (!isMainThread && parentPort) {
  const port = parentPort;
  port.on('message', (message: WorkerRequest) => {
    renderJob(message.job)
      .then((outputs) => {
        const response: WorkerResponse = { requestId: message.requestId, outputs };
        port.postMessage(response);
      })
      .catch((error: unknown) => {
        const response: WorkerResponse = {
          requestId: message.requestId,
          error: error instanceof Error ? error.message : String(error),
        };
        port.postMessage(response);
      });
  });
}

export interface PoolOptions {
  readonly concurrency: number;
}

/**
 * Renders every job across a small `worker_threads` pool (default/CI concurrency: 2, per the
 * bake worker-pool budget), round-robin dispatching one job per idle worker at a time.
 */
export async function runPool(
  jobs: readonly RenderJob[],
  options: PoolOptions,
): Promise<RenderOutput[]> {
  if (jobs.length === 0) return [];

  const concurrency = Math.max(1, Math.min(options.concurrency, jobs.length));
  const workerUrl = new URL(import.meta.url);
  const workers = Array.from(
    { length: concurrency },
    () => new Worker(workerUrl, { execArgv: ['--import', 'tsx/esm'] }),
  );

  const results: RenderOutput[] = [];
  let nextIndex = 0;
  let requestSeq = 0;

  await new Promise<void>((resolve, reject) => {
    let inFlight = 0;
    let settled = false;

    const finishIfDone = (): void => {
      if (!settled && nextIndex >= jobs.length && inFlight === 0) {
        settled = true;
        resolve();
      }
    };

    const dispatch = (worker: Worker): void => {
      if (settled || nextIndex >= jobs.length) return;
      const job = jobs[nextIndex++];
      if (!job) return;
      inFlight++;
      const requestId = requestSeq++;

      const onMessage = (message: WorkerResponse): void => {
        if (message.requestId !== requestId) return;
        worker.off('message', onMessage);
        inFlight--;
        if (message.error) {
          if (!settled) {
            settled = true;
            reject(new Error(`render job failed for ${job.outPath}: ${message.error}`));
          }
          return;
        }
        for (const output of message.outputs ?? []) results.push(output);
        dispatch(worker);
        finishIfDone();
      };

      worker.on('message', onMessage);
      const request: WorkerRequest = { requestId, job };
      worker.postMessage(request);
    };

    for (const worker of workers) {
      worker.on('error', (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
      dispatch(worker);
    }
  });

  await Promise.all(workers.map((worker) => worker.terminate()));
  return results;
}
