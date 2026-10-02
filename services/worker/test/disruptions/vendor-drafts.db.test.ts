/**
 * Which way a guide's vendor draft goes, against a migrated Postgres: to the desk only while its
 * WhatsApp number is live and a person staffs it (`safety.ops_desk`); otherwise the member sends it
 * from their own WhatsApp.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createVendorDraft } from '../../src/jobs/disruptions/vendor-drafts';
import { buildGuidePlan, type GuidePlanFixture } from '../guide-actions/plan-fixture';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let fx: GuidePlanFixture;
let providerId: string;

async function draftChannel(): Promise<string> {
  const draft = await withSystem(harness.pool, (tx) =>
    createVendorDraft(tx, {
      tripId: fx.tripId,
      crewId: fx.crewId,
      requestedBy: fx.organiserId,
      providerId,
      vendorName: 'Made',
      body: 'Hi Made, could you pick us up at 19:30 instead?',
    }),
  );
  // Each case starts a fresh thread, so the channel is chosen again.
  await harness.pool.query("UPDATE ops.vendor_threads SET status = 'closed' WHERE id = $1", [
    draft.threadId,
  ]);
  return draft.channel;
}

const setDesk = (on: boolean) =>
  harness.pool.query(
    `INSERT INTO ops.ops_config (key, value) VALUES ('safety.ops_desk', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(on)],
  );

const setWhatsApp = (on: boolean) =>
  harness.pool.query(
    "UPDATE ops.partner_adapters SET enabled = $1 WHERE partner = 'whatsapp_business'",
    [on],
  );

beforeAll(async () => {
  harness = await startJobsHarness();
  fx = await buildGuidePlan(harness.pool, { inTrip: true });
  const made = await harness.pool.query<{ id: string }>(
    `INSERT INTO providers (trip_id, kind, name, added_by)
     VALUES ($1, 'driver', 'Made', $2) RETURNING id`,
    [fx.tripId, fx.organiserId],
  );
  providerId = made.rows[0]?.id as string;
}, 240_000);

afterAll(async () => {
  await harness.close();
});

describe('vendor draft channel', () => {
  it('stays with the member while nobody staffs the desk, even with WhatsApp live', async () => {
    await setWhatsApp(true);
    await setDesk(false);
    expect(await draftChannel()).toBe('self_send');
  });

  it('stays with the member while the WhatsApp number is off, even with the desk staffed', async () => {
    await setWhatsApp(false);
    await setDesk(true);
    expect(await draftChannel()).toBe('self_send');
  });

  it('goes to the desk with WhatsApp live and a person staffing it', async () => {
    await setWhatsApp(true);
    await setDesk(true);
    expect(await draftChannel()).toBe('whatsapp_business');
  });
});
