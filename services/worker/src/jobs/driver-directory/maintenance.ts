/**
 * Driver directory upkeep:
 *
 * - `driver_invite.expire` (hourly): live invites past their 30 days switch off.
 * - `driver_listing.stats` (nightly): every listing's stats are recomputed from the crews' answers,
 *   and the rating-ring check raises an ops flag (with its evidence) for an account that rated the
 *   same driver on several trips from new crews.
 * - `driver_listing.purge_removed` (nightly): listings ops took down are deleted after the window.
 */
import { withSystem } from '@cp/db';
import {
  computeListingStats,
  detectRatingRings,
  DRIVER_DIRECTORY_QUEUES,
  LISTING_RATING_VOTES_SQL,
  listingStatsParams,
  TAKEN_DOWN_LISTING_RETENTION_DAYS,
  UPSERT_LISTING_STATS_SQL,
  type ListingRatingRow,
  type ListingRatingVote,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export async function expireDriverInvites(pool: pg.Pool, now: Date = new Date()): Promise<number> {
  return withSystem(pool, async (tx) => {
    const { rowCount } = await tx.query(
      `UPDATE driver_invites SET status = 'expired'
        WHERE status IN ('sent', 'opened') AND expires_at <= $1`,
      [now],
    );
    return rowCount ?? 0;
  });
}

export interface ListingSweepReport {
  readonly listings: number;
  readonly flagsRaised: number;
}

export async function refreshListingsAndFlags(pool: pg.Pool): Promise<ListingSweepReport> {
  return withSystem(pool, async (tx) => {
    const { rows: listings } = await tx.query<{ id: string }>(
      "SELECT id FROM driver_listings WHERE status IN ('listed', 'paused')",
    );
    let flagsRaised = 0;
    for (const { id } of listings) {
      const votes = await tx.query<ListingRatingVote>(LISTING_RATING_VOTES_SQL, [id]);
      await tx.query(
        UPSERT_LISTING_STATS_SQL,
        listingStatsParams(id, computeListingStats(votes.rows)),
      );
      flagsRaised += await flagRatingRings(tx, id);
    }
    return { listings: listings.length, flagsRaised };
  });
}

/** Raises (or refreshes) the listing's open rating-ring flag; returns 1 when a new one opened. */
export async function flagRatingRings(tx: pg.PoolClient, listingId: string): Promise<number> {
  const { rows } = await tx.query<ListingRatingRow>(
    `SELECT r.user_id, r.trip_id, r.crew_id,
            floor(extract(epoch FROM (r.created_at - c.created_at)) / 86400)::int AS crew_age_days
       FROM driver_ratings r JOIN crews c ON c.id = r.crew_id
      WHERE r.listing_id = $1`,
    [listingId],
  );
  const rings = detectRatingRings(rows);
  if (rings.length === 0) return 0;
  const { rowCount } = await tx.query(
    `INSERT INTO driver_listing_flags (listing_id, kind, evidence)
     VALUES ($1, 'rating_ring', $2)
     ON CONFLICT (listing_id, kind) WHERE status = 'open'
       DO UPDATE SET evidence = EXCLUDED.evidence
     RETURNING (xmax = 0) AS inserted`,
    [listingId, JSON.stringify({ accounts: rings })],
  );
  return rowCount === 1 ? 1 : 0;
}

export async function purgeTakenDownListings(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<number> {
  return withSystem(pool, async (tx) => {
    const { rowCount } = await tx.query(
      `DELETE FROM driver_listings
        WHERE status = 'removed' AND updated_at <= $1::timestamptz - make_interval(days => $2)`,
      [now, TAKEN_DOWN_LISTING_RETENTION_DAYS],
    );
    return rowCount ?? 0;
  });
}

export function driverDirectoryMaintenanceJobs(): AnyJobDefinition[] {
  return [
    defineJob({
      queue: DRIVER_DIRECTORY_QUEUES.inviteExpire,
      schema: z.object({}).nullish(),
      handler: async (_data, { pool }) => ({ expired: await expireDriverInvites(pool) }),
    }),
    defineJob({
      queue: DRIVER_DIRECTORY_QUEUES.listingStats,
      schema: z.object({}).nullish(),
      handler: async (_data, { pool }) => ({ ...(await refreshListingsAndFlags(pool)) }),
    }),
    defineJob({
      queue: DRIVER_DIRECTORY_QUEUES.purgeRemoved,
      schema: z.object({}).nullish(),
      handler: async (_data, { pool }) => ({ purged: await purgeTakenDownListings(pool) }),
    }),
  ];
}
