/**
 * Pool sizes read from env. Every Postgres pool a service opens takes its maximum from one of these
 * so the connection budget in infra/railway/README.md can be tuned per environment without a
 * deploy of new code. The cap of 50 guards against a typo that would exhaust the database.
 */
import { z } from 'zod';

export const POOL_MAX_LIMIT = 50;

/** A pool maximum: an integer 1..50, `''` or unset meaning `fallback`. */
export function poolMaxEnv(fallback: number) {
  return z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(1).max(POOL_MAX_LIMIT).default(fallback),
  );
}
