/**
 * The caller's own days for the free-days preview on the real stack: a week from the asked start
 * with each day as shared (free, maybe, busy) and unknown where nothing was; only the caller's own
 * days come back, never a crewmate's; someone outside the trip gets `NOT_FOUND`.
 */
import type { MyDaysResult } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerMyDaysRead } from '../../../src/planning/trip-settings/my-days';
import {
  buildSetupCrew,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function get<T>(who: SignedIn, path: string): Promise<{ status: number; body: T }> {
  const response = await harness.request(path, { headers: { cookie: who.cookie } });
  return { status: response.status, body: (await response.json()) as T };
}

beforeAll(async () => {
  harness = await startSetupHarness(undefined, (app, deps) => registerMyDaysRead(app, deps));
  crew = await buildSetupCrew(harness, 2);
  const [org, ray] = crew.members as [SignedIn, SignedIn];
  const mark = async (who: SignedIn, days: { offset: number; state: string }[]) =>
    expect(
      (
        await harness.run(who, 'set_availability', {
          trip_id: crew.tripId,
          days: days.map((entry) => ({
            date: day(entry.offset),
            state: entry.state,
            source: 'manual',
          })),
        })
      ).status,
    ).toBe(200);
  await mark(org, [
    { offset: 10, state: 'free' },
    { offset: 11, state: 'maybe' },
    { offset: 13, state: 'busy' },
  ]);
  await mark(ray, [{ offset: 12, state: 'free' }]);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('my days', () => {
  it('reads a week of the caller’s own days, unknown where nothing was shared', async () => {
    const [org] = crew.members as [SignedIn];
    const { status, body } = await get<MyDaysResult>(
      org,
      `/v1/trips/${crew.tripId}/my-days?start=${day(10)}`,
    );
    expect(status).toBe(200);
    expect(body.days.map((entry) => entry.date)).toEqual(
      [10, 11, 12, 13, 14, 15, 16].map((offset) => day(offset)),
    );
    expect(body.days.map((entry) => entry.state)).toEqual([
      'free',
      'maybe',
      'unknown',
      'busy',
      'unknown',
      'unknown',
      'unknown',
    ]);
  });

  it('never returns a crewmate’s days', async () => {
    const [, ray] = crew.members as [SignedIn, SignedIn];
    const { body } = await get<MyDaysResult>(
      ray,
      `/v1/trips/${crew.tripId}/my-days?start=${day(10)}`,
    );
    expect(body.days.map((entry) => entry.state)).toEqual([
      'unknown',
      'unknown',
      'free',
      'unknown',
      'unknown',
      'unknown',
      'unknown',
    ]);
  });

  it('is not found for someone outside the trip', async () => {
    const outsider = await harness.signIn();
    const { status } = await get(outsider, `/v1/trips/${crew.tripId}/my-days?start=${day(10)}`);
    expect(status).toBe(404);
  });
});
