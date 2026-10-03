/**
 * `anniversaries` (C2, RLS S): the anniversary scan's timers. No actor reads them through
 * app_user, guide_reader or powersync_repl, and they are in no publication and no stream.
 */
import { afterAll, beforeAll, describe, it } from 'vitest';

import { expectSealed } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('anniversaries', () => {
  it('is read by nobody but the worker', async () => {
    await expectSealed(harness, 'anniversaries', { owner: null });
  });
});
