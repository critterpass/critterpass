import { Hono } from 'hono';

/** A dependency probe used by `/ready`; resolves when the dependency answers, rejects otherwise. */
export type ReadinessCheck = () => Promise<void>;

export interface HealthAppDeps {
  version: string;
  commit: string;
  readiness: Record<string, ReadinessCheck>;
  checkTimeoutMs?: number;
}

async function probe(check: ReadinessCheck, timeoutMs: number): Promise<'ok' | 'fail'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('readiness probe timed out')), timeoutMs);
  });
  try {
    await Promise.race([check(), timeout]);
    return 'ok';
  } catch {
    return 'fail';
  } finally {
    clearTimeout(timer);
  }
}

/** Private health endpoint for Railway: same `/health` + `/ready` contract as the api. */
export function createHealthApp(deps: HealthAppDeps) {
  const timeoutMs = deps.checkTimeoutMs ?? 2000;
  const app = new Hono();

  app.get('/health', (c) =>
    c.json({ status: 'ok', service: 'worker', version: deps.version, commit: deps.commit }),
  );

  app.get('/ready', async (c) => {
    const entries = await Promise.all(
      Object.entries(deps.readiness).map(
        async ([name, check]) => [name, await probe(check, timeoutMs)] as const,
      ),
    );
    const checks = Object.fromEntries(entries);
    const ready = entries.every(([, result]) => result === 'ok');
    return c.json({ status: ready ? 'ok' : 'unavailable', checks }, ready ? 200 : 503);
  });

  return app;
}
