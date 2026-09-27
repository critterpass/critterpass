/**
 * Local-only travellers and queue items for the console's work areas (moderation, support, desk),
 * so the dev server and the Playwright suite have real rows to act on. Fixed ids, idempotent.
 */
import type pg from 'pg';

export const LOCAL_TRAVELLERS = [
  {
    id: '01920000-0000-7000-8000-00000000a001',
    name: 'Mai Tran',
    username: 'maitran',
    email: 'mai@traveller.test',
    phone: '+84901234567',
  },
  {
    id: '01920000-0000-7000-8000-00000000a002',
    name: 'Spammy Sam',
    username: 'spam_sam',
    email: 'sam@traveller.test',
    phone: null,
  },
  {
    id: '01920000-0000-7000-8000-00000000a003',
    name: 'Linh Pham',
    username: 'linhp',
    email: 'linh@traveller.test',
    phone: null,
  },
  {
    id: '01920000-0000-7000-8000-00000000a004',
    name: 'Rude Rex',
    username: 'rude_rex',
    email: 'rex@traveller.test',
    phone: null,
  },
] as const;

const [mai, sam, linh, rex] = LOCAL_TRAVELLERS;

async function seedTravellers(client: pg.Client): Promise<void> {
  for (const traveller of LOCAL_TRAVELLERS) {
    await client.query(
      `INSERT INTO auth."user" (id, name, email, email_verified, phone_number, phone_number_verified)
       VALUES ($1, $2, $3, true, $4::text, $4::text IS NOT NULL) ON CONFLICT (id) DO NOTHING`,
      [traveller.id, traveller.name, traveller.email, traveller.phone],
    );
    await client.query(
      `INSERT INTO users (id, display_name, username, status) VALUES ($1, $2, $3, 'registered')
       ON CONFLICT (id) DO NOTHING`,
      [traveller.id, traveller.name, traveller.username],
    );
  }
}

async function seedReport(
  client: pg.Client,
  target: string,
  reason: string,
  reporters: readonly string[],
): Promise<void> {
  const { rowCount } = await client.query(
    "SELECT 1 FROM moderation_reports WHERE target_id = $1 AND status = 'open'",
    [target],
  );
  if (rowCount !== 0) return;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO moderation_reports (reporter_id, target_kind, target_id, reason, report_count)
     VALUES ($1, 'user', $2, $3, $4) RETURNING id`,
    [reporters[0], target, reason, reporters.length],
  );
  for (const reporter of reporters) {
    await client.query(
      `INSERT INTO ops.moderation_filings (report_id, reporter_id, reason) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [rows[0]?.id, reporter, reason],
    );
  }
}

export async function seedWorkQueues(client: pg.Client): Promise<void> {
  await seedTravellers(client);
  await seedReport(client, sam.id, 'spam', [mai.id, linh.id]);
  await seedReport(client, rex.id, 'harassment', [linh.id]);
}
