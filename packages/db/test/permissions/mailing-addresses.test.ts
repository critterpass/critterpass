/**
 * `mailing_addresses` (C3, RLS X): a traveller's sealed postal address. Only its owner reads it;
 * the crew (organiser included), guide_reader and powersync_repl read nothing, and it is in no
 * publication and no stream.
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

describe('mailing_addresses', () => {
  it('is sealed to its owner', async () => {
    await expectSealed(harness, 'mailing_addresses', { owner: 'organiser' });
  });
});
