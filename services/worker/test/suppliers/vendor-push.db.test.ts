/**
 * The push for a message to a place waiting for a yes: only the traveller the thread is kept for
 * gets it, only for a draft the desk would send, never for one they wrote in the app themselves,
 * and never once the draft was answered. The push carries the draft id APPROVE answers.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getRegistration, type RoutedEvent } from '../../src/jobs/notify/register';
import { registerVendorNotifications } from '../../src/jobs/suppliers/notify';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let user: string;
let tripId: string;
let poiId: string;

beforeAll(async () => {
  harness = await startJobsHarness();
  registerVendorNotifications();
  user = randomUUID();
  await harness.pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [user]);
  const crew = await harness.pool.query<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Push crew', $1) RETURNING id",
    [user],
  );
  const trip = await harness.pool.query<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crew.rows[0]!.id],
  );
  tripId = trip.rows[0]!.id;
  const destination = await harness.pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name) VALUES ($1, 'Bali') RETURNING id",
    [`bali-${randomUUID().slice(0, 8)}`],
  );
  const poi = await harness.pool.query<{ id: string }>(
    "INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, 'Locavore', 'food', -8.5, 115.26) RETURNING id",
    [destination.rows[0]!.id],
  );
  poiId = poi.rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await harness?.close();
});

async function draft(
  channel: 'whatsapp_business' | 'self_send',
  actorId: string | null,
): Promise<{ event: RoutedEvent; messageId: string }> {
  const thread = await harness.pool.query<{ id: string }>(
    `INSERT INTO ops.vendor_threads (trip_id, requested_by, poi_id, vendor_name, channel)
     VALUES ($1, $2, $3, 'Locavore', $4) RETURNING id`,
    [tripId, user, poiId, channel],
  );
  const messageId = randomUUID();
  await harness.pool.query(
    `INSERT INTO ops.vendor_messages (id, thread_id, trip_id, direction, body, status)
     VALUES ($1, $2, $3, 'outbound', 'Table for 6 at 19:30?', 'draft')`,
    [messageId, thread.rows[0]!.id, tripId],
  );
  const event: RoutedEvent = {
    id: randomUUID(),
    type: 'vendor_msg.drafted',
    payload: { trip_id: tripId, thread_id: thread.rows[0]!.id, message_id: messageId, channel },
    crewId: null,
    tripId,
    actorId,
    occurredAt: new Date(),
  };
  return { event, messageId };
}

const registration = () => getRegistration('vendor_msg.drafted', 'vendor_draft_ready')!;

describe('vendor draft push', { timeout: 60_000 }, () => {
  it('asks the traveller for a yes on a draft the desk sends, with the exact text', async () => {
    const { event, messageId } = await draft('whatsapp_business', null);
    await withSystem(harness.pool, async (tx) => {
      expect(await registration().audience(tx, event)).toEqual([user]);
      const push = await registration().compose(tx, event, user);
      expect(push?.vars).toEqual({ vendor: 'Locavore', text: 'Table for 6 at 19:30?' });
      expect(push?.ctx).toMatchObject({ draft_id: messageId });
      expect(push?.needsYou).toBe(true);
    });
  });

  it('stays quiet for a draft the traveller wrote in the app or sends themselves', async () => {
    const own = await draft('whatsapp_business', user);
    const selfSend = await draft('self_send', null);
    await withSystem(harness.pool, async (tx) => {
      expect(await registration().audience(tx, own.event)).toEqual([]);
      expect(await registration().audience(tx, selfSend.event)).toEqual([]);
    });
  });

  it('stays quiet once the draft is no longer waiting', async () => {
    const { event, messageId } = await draft('whatsapp_business', null);
    await harness.pool.query("UPDATE ops.vendor_messages SET status = 'superseded' WHERE id = $1", [
      messageId,
    ]);
    await withSystem(harness.pool, async (tx) => {
      expect(await registration().compose(tx, event, user)).toBeNull();
    });
  });
});
