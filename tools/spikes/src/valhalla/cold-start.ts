import { z } from 'zod';

import { formatError } from '../shared/format-error';

/**
 * Polls a Valhalla `/status` endpoint until it answers 200, printing one elapsed-time report.
 * Run this immediately after triggering a deploy (measures first-boot tile build time) or a
 * restart (measures a warm restart that reuses the volume's already-built tiles).
 */
const envSchema = z.object({
  VALHALLA_BASE_URL: z.url(),
  VALHALLA_COLD_START_LABEL: z.string().min(1).default('unknown'),
  VALHALLA_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  // First-boot tile builds can run for hours; default ceiling is generous on purpose.
  VALHALLA_POLL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(4 * 60 * 60 * 1000),
});

function loadEnv(): z.infer<typeof envSchema> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`valhalla cold-start: invalid environment:\n  ${problems.join('\n  ')}`);
  }
  return parsed.data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntilReady(
  baseUrl: string,
  intervalMs: number,
  timeoutMs: number,
  onAttempt: (elapsedMs: number, attempt: number) => void,
): Promise<{ readyAfterMs: number; attempts: number }> {
  const startedAt = Date.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > timeoutMs) {
      throw new Error(`valhalla cold-start: ${baseUrl}/status was not ready within ${timeoutMs}ms`);
    }
    try {
      const response = await fetch(`${baseUrl}/status`, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) return { readyAfterMs: Date.now() - startedAt, attempts: attempt };
    } catch {
      // Not ready yet (connection refused/reset while the container is still starting/building).
    }
    onAttempt(elapsedMs, attempt);
    await sleep(intervalMs);
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const { readyAfterMs, attempts } = await pollUntilReady(
    env.VALHALLA_BASE_URL,
    env.VALHALLA_POLL_INTERVAL_MS,
    env.VALHALLA_POLL_TIMEOUT_MS,
    (elapsedMs, attempt) =>
      console.error(
        JSON.stringify({
          msg: 'valhalla cold-start poll',
          label: env.VALHALLA_COLD_START_LABEL,
          elapsedMs,
          attempt,
        }),
      ),
  );
  console.log(
    JSON.stringify({
      msg: 'valhalla cold-start ready',
      label: env.VALHALLA_COLD_START_LABEL,
      readyAfterMs,
      readyAfterSeconds: Math.round(readyAfterMs / 1000),
      attempts,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ msg: 'valhalla cold-start failed', error: formatError(error) }));
  process.exitCode = 1;
});
