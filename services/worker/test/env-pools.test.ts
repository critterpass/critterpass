import { describe, expect, it } from 'vitest';

import { workerEnvSchema } from '../src/env';

const pools = workerEnvSchema.pick({ DATABASE_URL: true, DB_POOL_MAX: true, JOBS_POOL_MAX: true });

describe('worker pool sizes', () => {
  it('default to the budgeted sizes, with handlers on the direct URL when no pooled URL is set', () => {
    expect(pools.parse({ DATABASE_URL: '' })).toEqual({
      DATABASE_URL: undefined,
      DB_POOL_MAX: 5,
      JOBS_POOL_MAX: 2,
    });
  });

  it('take explicit sizes and the PgBouncer URL from env', () => {
    const url = 'postgres://user:pw@db.example:6432/postgres';
    expect(pools.parse({ DATABASE_URL: url, DB_POOL_MAX: '4', JOBS_POOL_MAX: '3' })).toEqual({
      DATABASE_URL: url,
      DB_POOL_MAX: 4,
      JOBS_POOL_MAX: 3,
    });
  });

  it('refuse a size above the limit', () => {
    expect(pools.safeParse({ JOBS_POOL_MAX: '500' }).success).toBe(false);
  });
});
