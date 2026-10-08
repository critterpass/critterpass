/**
 * The rates setup converts with, over the real local database: the newest rate of each currency,
 * so a day whose run has only some currencies in yet does not take the others' rates away.
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { TRIP_ID } from '../../scenes/fixtures';
import { seedKyoto } from '../../test-support/setup-harness';
import { useCrewMoney } from '../crew-money';

jest.setTimeout(60_000);

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('converting for a dong crew', () => {
  it('uses yesterday’s dong rate while today’s run has only the dollar in', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedKyoto(stack);
    await stack.db.execute("UPDATE crews SET settlement_currency = 'VND'");
    const rows: [string, string, string, string][] = [
      ['a', 'USD', '1.25', '2027-03-01'],
      ['b', 'VND', '32500', '2027-03-01'],
      // The next day's run so far: the dollar alone.
      ['c', 'USD', '1.3', '2027-03-02'],
    ];
    for (const [id, quote, rate, asOf] of rows) {
      await stack.db.execute(
        `INSERT INTO fx_snapshots (id, base, quote, rate, as_of, source)
         VALUES (?, 'EUR', ?, ?, ?, 'frankfurter')`,
        [id, quote, rate, asOf],
      );
    }
    const { result } = await renderHook(() => useCrewMoney(TRIP_ID), { wrapper: stack.wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await waitFor(() => expect(result.current.currency).toBe('VND'));
    // $7 at the newest dollar rate (1.3) and the newest dong rate (32,500): 25,000 ₫ to the dollar.
    expect(result.current.convert(700, 'USD')).toEqual({ amountMinor: 175_000, currency: 'VND' });
  });
});
