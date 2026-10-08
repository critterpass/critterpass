/**
 * The developer seed routes fill an account with a demo crew and trip. They must never be
 * reachable in production, whatever the flag says, and are off elsewhere until it is switched on.
 */
import { describe, expect, it } from 'vitest';

import { registerDevRoutesFromEnv } from '../../src/dev/routes';

describe('demo seed mounting', () => {
  const noop = () => {
    throw new Error('never called');
  };
  const deps = {
    pool: {} as never,
    sessions: noop as never,
    redis: {} as never,
    logger: { info: () => undefined, warn: () => undefined },
  };
  const app = { post: () => undefined } as never;

  it('mounts only outside production with the flag on', () => {
    expect(
      registerDevRoutesFromEnv(app, deps, { APP_ENV: 'staging', DEV_SEED_ENABLED: true }),
    ).toBe(true);
    expect(
      registerDevRoutesFromEnv(app, deps, { APP_ENV: 'staging', DEV_SEED_ENABLED: false }),
    ).toBe(false);
    expect(
      registerDevRoutesFromEnv(app, deps, { APP_ENV: 'production', DEV_SEED_ENABLED: true }),
    ).toBe(false);
  });
});
