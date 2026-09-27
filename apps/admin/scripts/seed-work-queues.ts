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

export const LOCAL_JOIN_CODE = 'MQ7R2K';
const MAI_DEVICE = '01920000-0000-7000-8000-00000000d001';

/** Mai's live session, phone and action key, and her referral code, for the support screens. */
async function seedSupport(client: pg.Client): Promise<void> {
  await client.query(
    `INSERT INTO auth.session (id, user_id, token, expires_at, user_agent)
     VALUES ('01920000-0000-7000-8000-00000000c001', $1, 'local-mai-session-token',
             now() + interval '30 days', 'CritterPass/1.4.0 (iPhone; iOS 26.0)')
     ON CONFLICT (id) DO NOTHING`,
    [mai.id],
  );
  await client.query(
    `INSERT INTO devices (id, user_id, platform, os_version, app_version, locale, tz)
     VALUES ($1, $2, 'ios', '26.0', '1.4.0', 'vi', 'Asia/Ho_Chi_Minh') ON CONFLICT (id) DO NOTHING`,
    [MAI_DEVICE, mai.id],
  );
  await client.query(
    `INSERT INTO device_action_keys (key_id, device_id, user_id, secret_enc, scopes, expires_at)
     VALUES ('local-mai-key', $1, $2, 'local-only', ARRAY['ballot'], now() + interval '30 days')
     ON CONFLICT (key_id) DO NOTHING`,
    [MAI_DEVICE, mai.id],
  );
  await client.query(
    `INSERT INTO join_codes (code, target_kind, target_id, created_by)
     SELECT $1, 'referral', $2, $2
     WHERE NOT EXISTS (SELECT 1 FROM join_codes WHERE code = $1 AND status = 'active')`,
    [LOCAL_JOIN_CODE, mai.id],
  );
}

export async function seedWorkQueues(client: pg.Client): Promise<void> {
  await seedTravellers(client);
  await seedSupport(client);
  await seedReport(client, sam.id, 'spam', [mai.id, linh.id]);
  await seedReport(client, rex.id, 'harassment', [linh.id]);
}
