/**
 * `album_picks` (C1/C2, RLS T): the trip's crew reads it and syncs it on the trip stream; the outsider,
 * the ex-member and an anonymous uid read nothing; only commands and the worker write it.
 */
import { afterAll, beforeAll, describe, it } from 'vitest';

import { expectCrewReadOnly } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('album_picks', () => {
  it('is read by the crew only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, 'album_picks');
  });
});
