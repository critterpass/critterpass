/**
 * A member's own default max on the real stack: it is theirs alone (nobody else can read it, and
 * setting one never touches another member's), a new amount replaces the old one, `null` forgets
 * it, and the amount reaches no command result, event, realtime hint, job or log line.
 */
import { withUser } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  capturedOutputs,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupHarness,
  type SignedIn,
} from './setup-harness';

// Distinctive amounts (minor units) that could not appear by accident anywhere.
const FIRST = 187_130;
const SECOND = 243_370;
const OTHERS = 311_910;

let harness: SetupHarness;
let maya: SignedIn;
let rin: SignedIn;
const bodies: string[] = [];

async function setDefault(who: SignedIn, amount: number | null, currency = 'USD') {
  const response = await harness.run(who, 'set_budget_default', {
    amount_minor: amount,
    currency,
  });
  bodies.push(JSON.stringify(response.body));
  return response;
}

/** Every default the owner pool holds, oldest first. */
async function stored() {
  const { rows } = await harness.pool.query<{ user_id: string; amount: number; currency: string }>(
    `SELECT user_id, amount_minor::int AS amount, currency::text AS currency
       FROM budget_defaults_private ORDER BY created_at, id`,
  );
  return rows;
}

/** The defaults `reader` can see through row-level security. */
async function visibleTo(reader: SignedIn) {
  return withUser(harness.pool, reader.uid, 'test', async (tx) => {
    const { rows } = await tx.query<{ user_id: string; amount: number }>(
      'SELECT user_id, amount_minor::int AS amount FROM budget_defaults_private',
    );
    return rows;
  });
}

beforeAll(async () => {
  harness = await startSetupHarness();
  maya = await harness.signIn();
  rin = await harness.signIn();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('set_budget_default', () => {
  it('keeps each member’s default as their own', async () => {
    expect(resultOf(await setDefault(maya, FIRST))).toEqual({ set: true });
    expect(resultOf(await setDefault(rin, OTHERS, 'SGD'))).toEqual({ set: true });
    expect(await stored()).toEqual([
      { user_id: maya.uid, amount: FIRST, currency: 'USD' },
      { user_id: rin.uid, amount: OTHERS, currency: 'SGD' },
    ]);
    expect(await visibleTo(maya)).toEqual([{ user_id: maya.uid, amount: FIRST }]);
    expect(await visibleTo(rin)).toEqual([{ user_id: rin.uid, amount: OTHERS }]);
  });

  it('replaces the amount and currency instead of keeping two', async () => {
    expect(resultOf(await setDefault(maya, SECOND, 'IDR'))).toEqual({ set: true });
    expect(await stored()).toEqual([
      { user_id: maya.uid, amount: SECOND, currency: 'IDR' },
      { user_id: rin.uid, amount: OTHERS, currency: 'SGD' },
    ]);
  });

  it('forgets the default on null, and only the caller’s', async () => {
    expect(resultOf(await setDefault(maya, null))).toEqual({ set: false });
    expect(await stored()).toEqual([{ user_id: rin.uid, amount: OTHERS, currency: 'SGD' }]);
    // Forgetting a default that is not there is not an error.
    const again = await setDefault(maya, null);
    expect(errorOf(again)).toEqual({});
    expect(resultOf(again)).toEqual({ set: false });
    expect(await stored()).toHaveLength(1);
  });

  it('lets the amount reach no result, event, hint, job or log line', async () => {
    const everything = [
      ...bodies,
      await capturedOutputs(harness.pool),
      harness.logs.join('\n'),
    ].join('\n');
    for (const amount of [FIRST, SECOND, OTHERS]) {
      expect(everything).not.toContain(String(amount));
      expect(everything).not.toContain((amount / 100).toFixed(2));
    }
  });
});
