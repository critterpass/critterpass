import { describe, expect, it } from 'vitest';

import { poolMaxEnv, POOL_MAX_LIMIT } from '../src/pool-env';

describe('poolMaxEnv', () => {
  const schema = poolMaxEnv(4);

  it('falls back to the default when unset or empty', () => {
    expect(schema.parse(undefined)).toBe(4);
    expect(schema.parse('')).toBe(4);
  });

  it('reads an integer from the env string', () => {
    expect(schema.parse('3')).toBe(3);
    expect(schema.parse(String(POOL_MAX_LIMIT))).toBe(POOL_MAX_LIMIT);
  });

  it('rejects zero, negatives, fractions, text and sizes above the limit', () => {
    for (const bad of ['0', '-1', '2.5', 'ten', String(POOL_MAX_LIMIT + 1)]) {
      expect(schema.safeParse(bad).success, bad).toBe(false);
    }
  });
});
