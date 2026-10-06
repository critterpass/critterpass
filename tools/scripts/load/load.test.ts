import { describe, expect, it } from 'vitest';

import { hasCheckpointComplete } from './powersync';
import { pool, summarise } from './push-fanout';
import { assertNotProduction, percentile } from './sessions';

describe('load harness', () => {
  it('never targets production', () => {
    expect(() => assertNotProduction('https://api.critterpass.app')).toThrow(/refusing/u);
    expect(() => assertNotProduction('https://api-staging-de92.up.railway.app')).not.toThrow();
    expect(() => assertNotProduction('http://localhost:8787')).not.toThrow();
  });

  it('spots a complete checkpoint in the sync stream', () => {
    expect(hasCheckpointComplete('{"checkpoint":{}}\n{"data":{}}\n')).toBe(false);
    expect(hasCheckpointComplete('{"data":{}}\n{"checkpoint_complete":{"last_op_id":"9"}}\n')).toBe(
      true,
    );
  });

  it('keeps at most the limit in flight and returns results in order', async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 20 }, (_, i) => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return i;
    });
    expect(await pool(tasks, 4)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(peak).toBe(4);
  });

  it('summarises throughput and groups errors', () => {
    const summary = summarise(
      [
        { ok: true, ms: 10 },
        { ok: false, ms: 30, error: 'UNREGISTERED' },
        { ok: false, ms: 20, error: 'UNREGISTERED' },
      ],
      1,
    );
    expect(summary).toEqual({
      messages: 3,
      failed: 2,
      perSecond: 3,
      p95Ms: 30,
      errors: { UNREGISTERED: 2 },
    });
    expect(percentile([], 95)).toBeUndefined();
  });
});
