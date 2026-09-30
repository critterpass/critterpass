import { expect, test } from '@playwright/test';
import pg from 'pg';

import { LOCAL_TRAVELLERS } from '../scripts/seed-work-queues';
import { E2E_DATABASE_URL } from './e2e-env';
import { nav, signInAs } from './session';

const [mai] = LOCAL_TRAVELLERS;
const APPROVED = 'Hi Locavore! Could you hold a table for 6 tonight at 21:00? Thank you — Mai';

/** A thread with Mai's approved text waiting to be sent (the desk number is off in this run). */
async function seedThread(): Promise<void> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const crew = await client.query<{ id: string }>(
      "INSERT INTO crews (name, created_by) VALUES ('Vendor desk crew', $1) RETURNING id",
      [mai.id],
    );
    const trip = await client.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [crew.rows[0]?.id],
    );
    const tripId = trip.rows[0]?.id;
    const poi = await client.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       SELECT id, 'Locavore', 'food', -8.51, 115.26 FROM destinations ORDER BY slug LIMIT 1
       RETURNING id`,
    );
    const task = await client.query<{ id: string }>(
      `INSERT INTO ops.concierge_tasks (kind, status, trip_id, requested_by, due_at)
       VALUES ('vendor_message', 'in_progress', $1, $2, now() + interval '3 hours') RETURNING id`,
      [tripId, mai.id],
    );
    const thread = await client.query<{ id: string }>(
      `INSERT INTO ops.vendor_threads (trip_id, requested_by, poi_id, vendor_name, channel, task_id)
       VALUES ($1, $2, $3, 'Locavore', 'whatsapp_business', $4) RETURNING id`,
      [tripId, mai.id, poi.rows[0]?.id, task.rows[0]?.id],
    );
    const message = await client.query<{ id: string }>(
      `INSERT INTO ops.vendor_messages (thread_id, trip_id, direction, intent, body, status)
       VALUES ($1, $2, 'outbound', 'reserve', $3, 'draft') RETURNING id`,
      [thread.rows[0]?.id, tripId, APPROVED],
    );
    const approval = await client.query<{ id: string }>(
      `INSERT INTO ops.approvals (user_id, subject_kind, subject_id, text_shown)
       VALUES ($1, 'vendor_message', $2, $3) RETURNING id`,
      [mai.id, message.rows[0]?.id, APPROVED],
    );
    await client.query(
      `UPDATE ops.vendor_messages SET status = 'approved', approved_by_user_id = $2,
         approved_at = now(), approval_id = $3,
         approved_text_sha256 = encode(sha256(convert_to(body, 'UTF8')), 'hex')
       WHERE id = $1`,
      [message.rows[0]?.id, mai.id, approval.rows[0]?.id],
    );
    await client.query('COMMIT');
  } finally {
    await client.end();
  }
}

test('ops sees the approved text read-only and can only ask the traveller to approve a change', async ({
  page,
}) => {
  await seedThread();
  await signInAs(page, 'ops');
  await nav(page).getByRole('link', { name: 'Vendor desk' }).click();

  const queue = page.getByRole('list', { name: 'vendor_desk queue' });
  await queue.getByRole('button', { name: /Locavore/ }).click();
  const outbound = page.getByLabel('Outbound');
  await expect(outbound).toContainText('Approved text · read-only');
  await expect(outbound).toContainText(APPROVED);
  await expect(outbound).toContainText('sha ');
  await expect(page.getByRole('button', { name: 'Send the approved text' })).toBeDisabled();
  await expect(page.getByLabel('Send')).toContainText('The desk WhatsApp number is off');

  await page
    .getByLabel(`Follow-up for ${mai.name} to approve`)
    .fill('Hi Locavore! Could you make that 6 at 21:30 instead? Thank you — Mai');
  await page.getByRole('button', { name: `Ask ${mai.name} to approve` }).click();

  await page.getByRole('tab', { name: 'awaiting approval' }).click();
  await queue.getByRole('button', { name: /Locavore/ }).click();
  await expect(page.getByLabel('Outbound')).toContainText('draft · waiting on the traveller');
  await expect(page.getByLabel('Outbound')).not.toContainText(APPROVED);
  await expect(page.getByLabel('Notes')).toContainText(`Draft reply sent to ${mai.name}`);
  await expect(page.getByLabel('Send')).toContainText(`sending needs ${mai.name}’s approval`);
});
