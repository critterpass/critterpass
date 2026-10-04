/**
 * Time limits for the slow steps of a place ingest (an S3 or catalog read through DuckDB, an OSM
 * extract download, an extract scan). A step that hangs fails with `StepTimeoutError` well before
 * its job expires, so the job is retried at once instead of holding the singleton queue until
 * pg-boss gives up on it.
 */
export class StepTimeoutError extends Error {
  constructor(step: string, ms: number) {
    super(`${step} took longer than ${Math.round(ms / 1000)} s`);
    this.name = 'StepTimeoutError';
  }
}

/**
 * Runs `step`, rejecting with `StepTimeoutError` after `ms`. `onTimeout` asks the work to stop (a
 * DuckDB interrupt, an aborted fetch); the rejection does not wait for it to.
 */
export async function withStepTimeout<T>(
  step: string,
  ms: number,
  run: () => Promise<T>,
  onTimeout?: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new StepTimeoutError(step, ms));
    }, ms);
  });
  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
