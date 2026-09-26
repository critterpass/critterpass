import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';

/** A dependency probe used by `/ready`; resolves when the dependency answers, rejects otherwise. */
export type ReadinessCheck = () => Promise<void>;

export interface HealthDeps {
  service: string;
  version: string;
  commit: string;
  readiness: Record<string, ReadinessCheck>;
  /** Upper bound for each probe so a hung dependency cannot hang the probe endpoint. */
  checkTimeoutMs?: number;
}

const HealthSchema = z
  .object({
    status: z.literal('ok'),
    service: z.string(),
    version: z.string(),
    commit: z.string(),
  })
  .openapi('Health');

const ReadySchema = z
  .object({
    status: z.enum(['ok', 'unavailable']),
    checks: z.record(z.string(), z.enum(['ok', 'fail'])),
  })
  .openapi('Readiness');

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['ops'],
  summary: 'Liveness: the process is up; never touches dependencies',
  responses: {
    200: { description: 'Alive', content: { 'application/json': { schema: HealthSchema } } },
  },
});

const readyRoute = createRoute({
  method: 'get',
  path: '/ready',
  tags: ['ops'],
  summary: 'Readiness: every dependency answered',
  responses: {
    200: { description: 'Ready', content: { 'application/json': { schema: ReadySchema } } },
    503: {
      description: 'A dependency failed',
      content: { 'application/json': { schema: ReadySchema } },
    },
  },
});

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

/** Runs every probe concurrently and reports each one by name. */
export async function runReadiness(
  readiness: Record<string, ReadinessCheck>,
  timeoutMs: number,
): Promise<{ ready: boolean; checks: Record<string, 'ok' | 'fail'> }> {
  const entries = await Promise.all(
    Object.entries(readiness).map(
      async ([name, check]) => [name, await probe(check, timeoutMs)] as const,
    ),
  );
  const checks = Object.fromEntries(entries);
  return { ready: entries.every(([, result]) => result === 'ok'), checks };
}

export function registerHealthRoutes<E extends { Variables: object }>(
  app: OpenAPIHono<E>,
  deps: HealthDeps,
) {
  const timeoutMs = deps.checkTimeoutMs ?? 2000;

  app.openapi(healthRoute, (c) =>
    c.json(
      { status: 'ok' as const, service: deps.service, version: deps.version, commit: deps.commit },
      200,
    ),
  );

  app.openapi(readyRoute, async (c) => {
    const { ready, checks } = await runReadiness(deps.readiness, timeoutMs);
    return ready
      ? c.json({ status: 'ok' as const, checks }, 200)
      : c.json({ status: 'unavailable' as const, checks }, 503);
  });
}
