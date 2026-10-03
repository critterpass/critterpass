/** The price display reads the signed-in uid under the same key the database writes it. */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { describe, expect, it, jest } from '@jest/globals';

import { OWNER_UID_KEY } from '../../powersync/local-tables';
import { OWNER_UID_STATE_KEY } from '../use-money-display';

describe('owner uid key', () => {
  it('matches the local database key', () => {
    expect(OWNER_UID_STATE_KEY).toBe(OWNER_UID_KEY);
  });
});
