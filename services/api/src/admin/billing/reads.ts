/**
 * Billing console reads (as admin_reader): a customer's billing timeline, webhook and reconcile
 * health, the partner Offer Code batches with their redemptions, and first trip free grants
 * waiting for review.
 */
import {
  billingHealthSchema,
  billingTimelineSchema,
  ftfReviewSchema,
  offerCodeBatchesSchema,
  RECONCILE_STATE_KEY,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { withAdminReader } from '../reads';
import { defineAdminRead } from '../registry';

const iso = (value: Date | null) => value?.toISOString() ?? null;
const uidParams = z.object({ uid: z.uuid() });

async function timeline(tx: pg.PoolClient, uid: string) {
  const q = <R extends object>(sql: string) => tx.query<R>(sql, [uid]).then((r) => r.rows);
  const [ent] = await q<{ pass_plus: boolean; expires_at: Date | null; computed_at: Date }>(
    'SELECT pass_plus, expires_at, computed_at FROM user_entitlements WHERE user_id = $1',
  );
  const subscriptions = await q<
    Record<string, unknown> & { period_end: Date | null; grace_ends_at: Date | null }
  >(
    `SELECT id, platform, product_key, status, auto_renew, period_end, grace_ends_at, environment
       FROM subscriptions WHERE user_id = $1 ORDER BY updated_at DESC`,
  );
  const transactions = await q<
    Record<string, unknown> & {
      purchased_at: Date;
      revoked_at: Date | null;
      price_minor: string | null;
    }
  >(
    `SELECT id, platform, transaction_id, product_key, purchased_at, price_minor::text, currency,
            revoked_at, revocation_reason
       FROM store_transactions WHERE user_id = $1 ORDER BY purchased_at DESC LIMIT 100`,
  );
  const events = await q<
    Record<string, unknown> & { received_at: Date; processed_at: Date | null }
  >(
    `SELECT id, event_id, type, received_at, processed_at, error FROM billing_events
      WHERE app_user_id = $1::text ORDER BY received_at DESC LIMIT 100`,
  );
  const boosts = await q<Record<string, unknown> & { ends_at: Date }>(
    `SELECT id, trip_id, source, status, ends_at FROM trip_boosts
      WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT 50`,
  );
  const [used] = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM ops.admin_audit WHERE action = 'extend_store_renewal'
      AND target_kind = 'user' AND target_id = $1 AND at > now() - interval '365 days'`,
  );
  return billingTimelineSchema.parse({
    user_id: uid,
    entitlements:
      ent === undefined
        ? null
        : {
            pass_plus: ent.pass_plus,
            expires_at: iso(ent.expires_at),
            computed_at: ent.computed_at.toISOString(),
          },
    subscriptions: subscriptions.map((s) => ({
      ...s,
      period_end: iso(s.period_end),
      grace_ends_at: iso(s.grace_ends_at),
    })),
    transactions: transactions.map((t) => ({
      ...t,
      purchased_at: t.purchased_at.toISOString(),
      revoked_at: iso(t.revoked_at),
      price_minor: t.price_minor === null ? null : Number(t.price_minor),
    })),
    events: events.map((e) => ({
      ...e,
      received_at: e.received_at.toISOString(),
      processed_at: iso(e.processed_at),
    })),
    boosts: boosts.map((b) => ({ ...b, ends_at: b.ends_at.toISOString() })),
    extensions_used_365d: used?.n ?? 0,
  });
}

/** Failed webhooks in 24 h and grants waiting for review: the area's badge and health tiles. */
export async function billingHealth(tx: pg.PoolClient) {
  const { rows } = await tx.query<{
    p95: number | null;
    failed: number;
    unprocessed: number;
    review: number;
    reconcile: unknown;
  }>(
    `SELECT
       (SELECT percentile_cont(0.95) WITHIN GROUP (
          ORDER BY extract(epoch FROM processed_at - received_at) * 1000)
          FROM billing_events WHERE received_at > now() - interval '24 hours'
           AND processed_at IS NOT NULL) AS p95,
       (SELECT count(*)::int FROM billing_events
         WHERE received_at > now() - interval '24 hours' AND error IS NOT NULL
           AND error NOT IN ('unknown_user', 'duplicate')) AS failed,
       (SELECT count(*)::int FROM billing_events WHERE processed_at IS NULL) AS unprocessed,
       (SELECT count(*)::int FROM ftf_grants WHERE abuse_decision = 'review') AS review,
       (SELECT value FROM ops.ops_config WHERE key = $1) AS reconcile`,
    [RECONCILE_STATE_KEY],
  );
  const row = rows[0];
  return billingHealthSchema.parse({
    webhook_lag_p95_ms: row?.p95 === null || row?.p95 === undefined ? null : Math.round(row.p95),
    failed_24h: row?.failed ?? 0,
    unprocessed: row?.unprocessed ?? 0,
    reconcile: row?.reconcile ?? null,
    ftf_to_review: row?.review ?? 0,
  });
}

export function billingReads(pool: pg.Pool) {
  return [
    defineAdminRead({
      path: '/billing/users/{uid}',
      area: 'billing',
      summary:
        "A customer's subscriptions, transactions, RevenueCat events, boosts and entitlements",
      params: uidParams,
      response: billingTimelineSchema,
      run: ({ admin, params }) =>
        withAdminReader(pool, admin.uid, (tx) => timeline(tx, params.uid)),
    }),
    defineAdminRead({
      path: '/billing/health',
      area: 'billing',
      summary: 'Webhook lag, failed webhooks, the last reconcile and first trip free reviews',
      response: billingHealthSchema,
      run: ({ admin }) => withAdminReader(pool, admin.uid, billingHealth),
    }),
    defineAdminRead({
      path: '/billing/offer-batches',
      area: 'billing',
      summary: 'Partner Offer Code batches and their redemptions',
      response: offerCodeBatchesSchema,
      run: async ({ admin, operators }) => {
        const rows = await withAdminReader(
          pool,
          admin.uid,
          async (tx) =>
            (
              await tx.query<{
                id: string;
                name: string;
                platform: string;
                offer_ref: string;
                size: number;
                redeemed: number;
                notes: string | null;
                recorded_by: string;
                created_at: Date;
              }>(
                `SELECT b.id, b.name, b.platform, b.offer_ref, b.size, b.notes, b.recorded_by, b.created_at,
                      (SELECT count(*)::int FROM store_transactions t
                        WHERE t.offer_code = b.offer_ref AND t.platform = b.platform) AS redeemed
                 FROM ops.offer_code_batches b ORDER BY b.created_at DESC`,
              )
            ).rows,
        );
        const emails = await operators.emails(rows.map((row) => row.recorded_by));
        return offerCodeBatchesSchema.parse({
          items: rows.map((row) => ({
            ...row,
            recorded_by: emails.get(row.recorded_by) ?? row.recorded_by,
            created_at: row.created_at.toISOString(),
          })),
        });
      },
    }),
    defineAdminRead({
      path: '/billing/ftf-review',
      area: 'billing',
      summary: 'First trip free grants flagged for review (a member set seen before)',
      response: ftfReviewSchema,
      run: async ({ admin }) => {
        const rows = await withAdminReader(
          pool,
          admin.uid,
          async (tx) =>
            (
              await tx.query<{
                id: string;
                crew_id: string;
                trip_id: string;
                organiser_id: string;
                abuse_decision: string;
                overlapping_grants: number;
                created_at: Date;
              }>(
                `SELECT g.id, g.crew_id, g.trip_id, g.organiser_id, g.abuse_decision, g.created_at,
                      (SELECT count(*)::int FROM ftf_grants o WHERE o.id <> g.id
                        AND o.member_overlap_hash = g.member_overlap_hash) AS overlapping_grants
                 FROM ftf_grants g WHERE g.abuse_decision = 'review' ORDER BY g.created_at`,
              )
            ).rows,
        );
        return ftfReviewSchema.parse({
          items: rows.map((row) => ({ ...row, created_at: row.created_at.toISOString() })),
        });
      },
    }),
  ];
}
