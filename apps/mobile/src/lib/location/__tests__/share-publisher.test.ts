import { describe, expect, it } from '@jest/globals';
import { LOCATION_BATCH_MAX } from '@cp/domain';

import type { EngineFix, FixUpload } from '../ports';
import { createSharePublisher } from '../share-publisher';

const fix = (at: number, over: Partial<EngineFix> = {}): EngineFix => ({
  lat: -8.5,
  lng: 115.26,
  acc: 6,
  at,
  stationary: false,
  mock: 0,
  ...over,
});

function setup(answer: (batch: FixUpload) => Promise<{ status: number; retryAfterS?: number }>) {
  let clock = 1_000_000;
  const sent: FixUpload[] = [];
  const publisher = createSharePublisher({
    now: () => clock,
    upload: (batch) => {
      sent.push(batch);
      return answer(batch);
    },
  });
  return { publisher, sent, advance: (ms: number) => (clock += ms) };
}

describe('share publisher', () => {
  it('sends nothing without an open share and batches every 5 s with one', async () => {
    const { publisher, sent, advance } = setup(() => Promise.resolve({ status: 202 }));
    publisher.push(fix(1));
    expect(await publisher.flush()).toBe(false);
    publisher.setShare({ id: 's1', reason: 'crew_map' });
    publisher.push(fix(2, { speed: 1.2 }));
    publisher.push(fix(3, { stationary: true }));
    advance(5000);
    expect(await publisher.flush()).toBe(true);
    expect(sent[0]?.fixes.map((f) => f.activity)).toEqual(['walking', 'stationary']);
    publisher.push(fix(4, { speed: 20 }));
    advance(1000);
    expect(await publisher.flush()).toBe(false);
    advance(4000);
    await publisher.flush();
    expect(sent[1]?.fixes[0]?.activity).toBe('automotive');
  });

  it('holds at most one batch of the newest fixes, in memory only', () => {
    const { publisher } = setup(() => Promise.resolve({ status: 202 }));
    publisher.setShare({ id: 's1', reason: 'help' });
    for (let i = 0; i < LOCATION_BATCH_MAX + 7; i += 1) publisher.push(fix(i));
    expect(publisher.pendingCount()).toBe(LOCATION_BATCH_MAX);
  });

  it('drops a batch it cannot send instead of queueing it', async () => {
    const { publisher, advance } = setup(() => Promise.reject(new Error('offline')));
    publisher.setShare({ id: 's1', reason: 'help' });
    publisher.push(fix(1));
    advance(5000);
    expect(await publisher.flush()).toBe(false);
    expect(publisher.pendingCount()).toBe(0);
  });

  it('waits out a rate limit, flushes SOS every 2 s and stops on a closed share', async () => {
    let status = 429;
    const { publisher, sent, advance } = setup(() => Promise.resolve({ status, retryAfterS: 4 }));
    publisher.setShare({ id: 's1', reason: 'sos' });
    publisher.push(fix(1));
    advance(2000);
    await publisher.flush();
    publisher.push(fix(2));
    advance(2000);
    expect(await publisher.flush()).toBe(false);
    status = 403;
    advance(2000);
    await publisher.flush();
    expect(sent).toHaveLength(2);
    expect(publisher.activeShare()).toBeNull();
    publisher.setShare({ id: 's2', reason: 'sos' });
    expect(publisher.pendingCount()).toBe(0);
  });
});
