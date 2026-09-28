import { describe, expect, it } from 'vitest';

import { apiEnvSchema } from '../src/env';

const pools = apiEnvSchema.pick({
  DB_POOL_MAX: true,
  AUTH_POOL_MAX: true,
  ADMIN_AUTH_POOL_MAX: true,
  JOBS_POOL_MAX: true,
});

describe('api pool sizes', () => {
  it('default to the budgeted sizes when unset', () => {
    expect(pools.parse({})).toEqual({
      DB_POOL_MAX: 10,
      AUTH_POOL_MAX: 5,
      ADMIN_AUTH_POOL_MAX: 2,
      JOBS_POOL_MAX: 1,
    });
  });

  it('take explicit sizes from env and treat empty values as unset', () => {
    expect(
      pools.parse({
        DB_POOL_MAX: '6',
        AUTH_POOL_MAX: '3',
        ADMIN_AUTH_POOL_MAX: '',
        JOBS_POOL_MAX: '2',
      }),
    ).toEqual({ DB_POOL_MAX: 6, AUTH_POOL_MAX: 3, ADMIN_AUTH_POOL_MAX: 2, JOBS_POOL_MAX: 2 });
  });

  it('refuse a size that is not a positive integer', () => {
    expect(pools.safeParse({ DB_POOL_MAX: '0' }).success).toBe(false);
    expect(pools.safeParse({ AUTH_POOL_MAX: 'many' }).success).toBe(false);
  });
});
