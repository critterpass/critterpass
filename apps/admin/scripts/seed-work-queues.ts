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
    `INSERT INTO moderation_reports
       (reporter_id, target_kind, target_id, reason, report_count, author_id, reason_counts)
     VALUES ($1, 'user', $2, $3, $4, $2, jsonb_build_object($3::text, $4::int)) RETURNING id`,
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

/** Desk tasks around "now": one overdue, one due soon with the user's approval, one waiting. */
async function seedDesk(client: pg.Client): Promise<void> {
  const approval = '01920000-0000-7000-8000-00000000e001';
  // Seeded notes read as written by the local ops operator (upserted before this runs).
  const author = await client.query<{ id: string }>(
    `SELECT id FROM auth."user" WHERE email = 'ops@critterpass.test'`,
  );
  const noteAuthor = author.rows[0]?.id ?? mai.id;
  const tasks = [
    {
      id: '01920000-0000-7000-8000-00000000f001',
      kind: 'vendor_message',
      status: 'new',
      requestedBy: mai.id,
      due: '45 minutes',
      note: 'Ask Warung Ibu Oka to hold a table for 4 on Friday 19:30.',
    },
    {
      id: '01920000-0000-7000-8000-00000000f002',
      kind: 'clinic_handoff',
      status: 'new',
      requestedBy: linh.id,
      due: '-10 minutes',
      note: 'Share the insurance card with BIMC Kuta before arrival.',
    },
    {
      id: '01920000-0000-7000-8000-00000000f003',
      kind: 'partner_booking',
      status: 'new',
      requestedBy: linh.id,
      due: '5 hours',
      note: 'Snorkel trip for 2, Saturday 08:00, via Viator.',
    },
    {
      id: '01920000-0000-7000-8000-00000000f004',
      kind: 'review',
      status: 'in_progress',
      requestedBy: null,
      due: '1 day',
      note: 'Check the Ubud day plan the guide redrafted twice.',
    },
  ] as const;
  for (const task of tasks) {
    await client.query(
      `INSERT INTO ops.concierge_tasks (id, kind, status, requested_by, due_at, notes)
       VALUES ($1, $2, $3, $4, now() + $5::interval,
               jsonb_build_array(jsonb_build_object('at', now(), 'admin_id', $6::text, 'text', $7::text)))
       ON CONFLICT (id) DO NOTHING`,
      [task.id, task.kind, task.status, task.requestedBy, task.due, noteAuthor, task.note],
    );
  }
  await client.query(
    `INSERT INTO ops.approvals (id, user_id, subject_kind, subject_id, text_shown, approved_at)
     VALUES ($1, $2, 'concierge_task', $3, $4, now() - interval '5 minutes')
     ON CONFLICT (id) DO NOTHING`,
    [
      approval,
      mai.id,
      tasks[0].id,
      'Hi Ibu Oka! Could you hold a table for 4 this Friday at 19:30? Thank you — Mai (via CritterPass)',
    ],
  );
  await client.query('UPDATE ops.concierge_tasks SET approval_id = $2 WHERE id = $1', [
    tasks[0].id,
    approval,
  ]);
}

/** Ideas for the console's review list: two suggestions waiting and one already on the board. */
async function seedIdeas(client: pg.Client): Promise<void> {
  const ideas = [
    [
      '01920000-0000-7000-8000-00000000d001',
      mai.id,
      'Offline maps for the whole trip',
      'pending_review',
      0,
    ],
    [
      '01920000-0000-7000-8000-00000000d002',
      linh.id,
      'Split a bill by item, not evenly',
      'pending_review',
      0,
    ],
    ['01920000-0000-7000-8000-00000000d003', mai.id, 'Packing list everyone can tick', 'open', 14],
  ] as const;
  for (const [id, author, title, status, votes] of ideas) {
    await client.query(
      `INSERT INTO ideas (id, author_id, title, description, locale, status, votes_count)
       VALUES ($1, $2, $3, 'So the whole crew can use it on the road.', 'en', $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [id, author, title, status, votes],
    );
  }
}

export async function seedWorkQueues(client: pg.Client): Promise<void> {
  await seedTravellers(client);
  await seedIdeas(client);
  await seedSupport(client);
  await seedDesk(client);
  await seedReport(client, sam.id, 'spam', [mai.id, linh.id]);
  await seedReport(client, rex.id, 'harassment', [linh.id]);
}
