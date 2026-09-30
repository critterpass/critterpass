/**
 * The boost lifecycle jobs each ask the api for one step: `boost.expire` for the boost (or first
 * trip free) its timer names, `ftf.grant` and `boost.trip_changed` for their trip. One job per
 * object; a step the api refuses for good is recorded and not retried.
 */
import { describe, expect, it } from 'vitest';

import { boostExpireJob, ftfGrantJob, tripChangedJob } from '../../src/jobs/billing/boost-expire';
import { createBillingDoor } from '../../src/jobs/billing/door-client';
import { jobContext, recordedDoor } from './door-fixture';

const ID = '01920000-0000-7000-8000-0000000000c1';
const door = (responses: Array<{ status: number; body: unknown }>) => {
  const recorded = recordedDoor(responses);
  return {
    recorded,
    client: createBillingDoor({
      baseUrl: 'http://api',
      secret: 'door'.repeat(6),
      fetch: recorded.fetch,
    }),
  };
};

describe('boost lifecycle jobs', () => {
  it('ends the boost its timer names, once per boost', async () => {
    const { recorded, client } = door([
      { status: 200, body: { result: { boost_id: ID, status: 'ended' } } },
    ]);
    const job = boostExpireJob(client);
    const timer = {
      scheduled_event_id: ID,
      ref_id: ID,
      slot: '',
      due_at: '2026-10-20T00:00:00.000Z',
      data: {},
    };
    expect(job.singletonKey?.(timer)).toBe(ID);
    await expect(job.handler(timer, jobContext().ctx)).resolves.toEqual({
      result: { boost_id: ID, status: 'ended' },
    });
    expect(recorded.calls[0]).toMatchObject({
      url: 'http://api/internal/billing/expire_boost',
      body: { boost_id: ID },
    });
  });

  it('checks first trip free and moves a cancelled trip boost per trip', async () => {
    const { recorded, client } = door([
      { status: 200, body: { result: { granted: false, reason: 'too_few_seated' } } },
      { status: 422, body: { error: { code: 'VALIDATION' } } },
    ]);
    const ctx = jobContext().ctx;
    await expect(ftfGrantJob(client).handler({ trip_id: ID }, ctx)).resolves.toEqual({
      result: { granted: false, reason: 'too_few_seated' },
    });
    await expect(tripChangedJob(client).handler({ trip_id: ID }, ctx)).resolves.toEqual({
      refused: 'VALIDATION',
    });
    expect(recorded.calls.map((call) => call.url)).toEqual([
      'http://api/internal/billing/grant_ftf',
      'http://api/internal/billing/trip_changed',
    ]);
  });
});
