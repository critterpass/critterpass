import { watchPoolErrors } from '@cp/db';
import pg from 'pg';
import type { Logger } from 'pino';

/** The request pool, through PgBouncer; its size comes from `DB_POOL_MAX` (infra/railway/README.md). */
export function createRequestPool(
  connectionString: string,
  max: number,
  logger: Pick<Logger, 'error'>,
): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 30_000,
  });
  return watchPoolErrors(pool, (error) =>
    logger.error({ err: error, pool: 'request' }, 'database client error'),
  );
}
