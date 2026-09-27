import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPool, runMigrations } from '../src/client';
import { startPostgres, type StartedPostgreSqlContainer } from './helpers/containers';

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await startPostgres();
}, 180_000);

afterAll(async () => {
  await container.stop();
});

describe('runMigrations', () => {
  it('applies every migration once and is a no-op on a second run', async () => {
    const pool = createPool(container.getConnectionUri());
    try {
      const first = await runMigrations(pool);
      expect(first.applied.length).toBeGreaterThan(0);
      expect(first.applied).toEqual([...first.applied].sort());

      const second = await runMigrations(pool);
      expect(second.applied).toEqual([]);
    } finally {
      await pool.end();
    }
  });
});
