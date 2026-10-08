/**
 * `feedback_tickets` (C2, RLS O): a traveller reads the tickets they sent and receives them on me;
 * nobody else sees them, the triage columns stay with the server, and only the server writes.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('feedback_tickets', () => {
  it('keeps the triage and device columns from the owner, and off the stream', async () => {
    const { organiser } = harness.fixture.actors;
    for (const column of ['triage_summary', 'severity', 'device_info', 'duplicate_of']) {
      await expect(
        withUser(harness.db.pool, organiser, randomUUID(), (tx) =>
          tx.query(`SELECT ${column} FROM feedback_tickets`),
        ),
        column,
      ).rejects.toThrow(/permission denied/i);
    }
    const rows = await harness.rows('me', 'organiser');
    const [ticket] = rows.get('feedback_tickets') ?? [];
    expect(ticket).toBeDefined();
    expect(ticket?.['triage_summary']).toBeUndefined();
    expect(ticket?.['device_info']).toBeUndefined();
  });
});
