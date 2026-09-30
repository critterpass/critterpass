/**
 * `inbound_emails` and `inbound_sender_links` (C3, RLS S): mail that reached a crew address and
 * the senders members linked are the server's. No actor, not even the crew whose address it is,
 * no guide_reader, replication role, publication or stream can read either table.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import { expectSealed } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('inbound mail', () => {
  it('seals the mail from every actor, role, publication and stream', async () => {
    await expectSealed(harness, 'inbound_emails', { owner: null });
  });

  it('seals the linked senders the same way', async () => {
    await expectSealed(harness, 'inbound_sender_links', { owner: null });
  });

  it('keeps the quarantined mail for the system role', async () => {
    const { rows } = await withSystem(harness.db.pool, (tx) =>
      tx.query("SELECT 1 FROM inbound_emails WHERE crew_id = $1 AND status = 'quarantined'", [
        harness.fixture.crewId,
      ]),
    );
    expect(rows).toHaveLength(1);
  });
});
