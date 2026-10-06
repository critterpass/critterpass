/**
 * Local-only rows for the console's account-deletion and crew-plans views: a traveller who closed
 * their account twelve days ago, and a crew's published plan. Fixed ids;
 * every run puts both back to that starting state, so the Playwright suite can act on them again.
 */
import type pg from 'pg';

import { LOCAL_TRAVELLERS } from './seed-work-queues';

export const CLOSED_TRAVELLER = {
  id: '01920000-0000-7000-8000-00000000a005',
  name: 'Chloe Closing',
  username: 'chloe_closing',
  deletionId: '01920000-0000-7000-8000-00000000d001',
} as const;

export const LOCAL_SHARED_PLAN = {
  id: '01920000-0000-7000-8000-00000000c003',
  crewId: '01920000-0000-7000-8000-00000000c001',
  tripId: '01920000-0000-7000-8000-00000000c002',
  title: 'Four slow days in Ubud',
} as const;

async function seedClosedAccount(client: pg.Client): Promise<void> {
  const { id, name, username, deletionId } = CLOSED_TRAVELLER;
  await client.query(
    `INSERT INTO users (id, display_name, username, status, purge_at)
     VALUES ($1, $2, $3, 'closed', now() + interval '18 days')
     ON CONFLICT (id) DO UPDATE SET status = 'closed', purge_at = EXCLUDED.purge_at`,
    [id, name, username],
  );
  await client.query(
    `INSERT INTO account_deletions (id, user_id, requested_at, purge_at, source)
     VALUES ($1, $2, now() - interval '12 days', now() + interval '18 days', 'app')
     ON CONFLICT (id) DO UPDATE
       SET requested_at = EXCLUDED.requested_at, purge_at = EXCLUDED.purge_at,
           restored_at = NULL, purged_at = NULL`,
    [deletionId, id],
  );
}

async function seedSharedPlan(client: pg.Client): Promise<void> {
  const [mai] = LOCAL_TRAVELLERS;
  const { id, crewId, tripId, title } = LOCAL_SHARED_PLAN;
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM destinations WHERE slug = 'bali'",
  );
  const bali = rows[0]?.id;
  if (bali === undefined) return;
  await client.query(
    `INSERT INTO crews (id, name, created_by) VALUES ($1, 'Ubud four', $2)
     ON CONFLICT (id) DO NOTHING`,
    [crewId, mai.id],
  );
  await client.query(
    `INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')
     ON CONFLICT DO NOTHING`,
    [crewId, mai.id],
  );
  await client.query(
    `INSERT INTO trips (id, crew_id, status, destination_id) VALUES ($1, $2, 'voting', $3)
     ON CONFLICT (id) DO NOTHING`,
    [tripId, crewId, bali],
  );
  const projection = JSON.stringify({ destination_name: 'Bali', days_count: 4 });
  await client.query(
    `INSERT INTO shared_plans (id, trip_id, destination_id, requested_by, status, title, days_count,
       crew_size, projection, rating_avg, rating_count, copies_count, saves_count, published_at)
     VALUES ($1, $2, $3, $4, 'published', $5, 4, 4, $6::jsonb, 4.5, 6, 3, 11, now() - interval '5 days')
     ON CONFLICT (id) DO UPDATE
       SET status = 'published', projection = EXCLUDED.projection, unpublished_at = NULL,
           unpublish_reason = NULL`,
    [id, tripId, bali, mai.id, title, projection],
  );
}

export async function seedAccountAndCommunity(client: pg.Client): Promise<void> {
  await seedClosedAccount(client);
  await seedSharedPlan(client);
}
