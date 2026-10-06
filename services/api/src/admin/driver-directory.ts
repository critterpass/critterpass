/**
 * Ops console: the DRIVERS tab of the community area. Listings with their stats (loved / fine /
 * not again, trips, listed date) and open rating-ring flags with the evidence; a listing's answers;
 * and the three actions: hold answers (they stop counting at once), take a listing down (gone from
 * the directory at once), clear a flag. Open flags are a work queue.
 */
import {
  DomainError,
  LISTING_RATING_VOTES_SQL,
  computeListingStats,
  listingStatsParams,
  UPSERT_LISTING_STATS_SQL,
  type ListingRatingVote,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { withAdminReader } from './reads';
import {
  defineAdminArea,
  defineAdminCommand,
  defineAdminRead,
  type AdminWorkSource,
} from './registry';

const flagSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  evidence: z.record(z.string(), z.unknown()),
  status: z.string(),
  created_at: z.string(),
});

const listingSchema = z.object({
  id: z.uuid(),
  display_name: z.string(),
  areas: z.array(z.string()),
  languages: z.array(z.string()),
  status: z.string(),
  show_ratings: z.boolean(),
  listed_at: z.string(),
  stats: z.object({
    crews_rated: z.number().int(),
    crews_loved: z.number().int(),
    crews_fine: z.number().int(),
    crews_not_again: z.number().int(),
    trips: z.number().int(),
  }),
  flags: z.array(flagSchema),
});

const ratingSchema = z.object({
  id: z.uuid(),
  crew_id: z.uuid(),
  trip_id: z.uuid(),
  verdict: z.string(),
  tags: z.array(z.string()),
  status: z.string(),
  created_at: z.string(),
});

interface ListingRow {
  id: string;
  display_name: string;
  areas: string[];
  languages: string[];
  status: string;
  show_ratings: boolean;
  listed_at: Date;
  crews_rated: number | null;
  crews_loved: number | null;
  crews_fine: number | null;
  crews_not_again: number | null;
  trips: number | null;
  flags: {
    id: string;
    kind: string;
    evidence: Record<string, unknown>;
    status: string;
    created_at: string;
  }[];
}

function flagWorkSource(): AdminWorkSource {
  return {
    queue: 'driver_flags',
    area: 'community',
    closes: { action: 'clear_driver_flag' },
    async open(tx, ids) {
      const { rows } = await tx.query<{ id: string; display_name: string; created_at: Date }>(
        `SELECT f.id, l.display_name, f.created_at
           FROM driver_listing_flags f JOIN driver_listings l ON l.id = f.listing_id
          WHERE f.status = 'open' AND ($1::uuid[] IS NULL OR f.id = ANY($1::uuid[]))
          ORDER BY f.created_at LIMIT 500`,
        [ids ?? null],
      );
      return rows.map((row) => ({
        item_id: row.id,
        title: `Rating ring? · ${row.display_name}`,
        due_at: null,
        assignee: null,
      }));
    },
  };
}

async function refreshStats(tx: pg.PoolClient, listingId: string): Promise<void> {
  const { rows } = await tx.query<ListingRatingVote>(LISTING_RATING_VOTES_SQL, [listingId]);
  await tx.query(
    UPSERT_LISTING_STATS_SQL,
    listingStatsParams(listingId, computeListingStats(rows)),
  );
}

export function driverDirectoryArea(pool: pg.Pool) {
  const work = flagWorkSource();
  return defineAdminArea({
    id: 'driver-directory',
    work,
    reads: [
      defineAdminRead({
        path: '/driver-directory/listings',
        area: 'community',
        summary: 'Driver listings with crew answers and open anomaly flags',
        query: z.object({
          status: z.enum(['listed', 'paused', 'removed']).optional(),
          flagged: z.enum(['true', 'false']).optional(),
        }),
        response: z.object({ listings: z.array(listingSchema) }),
        run: async ({ admin, query }) => {
          const { rows } = await withAdminReader(pool, admin.uid, (tx) =>
            tx.query<ListingRow>(
              `SELECT l.id, l.display_name, l.areas, l.languages, l.status, l.show_ratings,
                      l.listed_at, s.crews_rated, s.crews_loved, s.crews_fine, s.crews_not_again,
                      s.trips,
                      coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind,
                                 'evidence', f.evidence, 'status', f.status,
                                 'created_at', f.created_at) ORDER BY f.created_at DESC)
                                  FROM driver_listing_flags f
                                 WHERE f.listing_id = l.id AND f.status = 'open'), '[]') AS flags
                 FROM driver_listings l LEFT JOIN driver_listing_stats s ON s.listing_id = l.id
                WHERE ($1::text IS NULL OR l.status = $1)
                ORDER BY l.listed_at DESC LIMIT 500`,
              [query.status ?? null],
            ),
          );
          const listings = rows
            .filter((row) => query.flagged !== 'true' || row.flags.length > 0)
            .map((row) => ({
              id: row.id,
              display_name: row.display_name,
              areas: row.areas,
              languages: row.languages,
              status: row.status,
              show_ratings: row.show_ratings,
              listed_at: row.listed_at.toISOString(),
              stats: {
                crews_rated: row.crews_rated ?? 0,
                crews_loved: row.crews_loved ?? 0,
                crews_fine: row.crews_fine ?? 0,
                crews_not_again: row.crews_not_again ?? 0,
                trips: row.trips ?? 0,
              },
              flags: row.flags,
            }));
          return { listings };
        },
      }),
      defineAdminRead({
        path: '/driver-directory/listings/{id}/ratings',
        area: 'community',
        summary: "A driver listing's crew answers",
        params: z.object({ id: z.uuid() }),
        response: z.object({ ratings: z.array(ratingSchema) }),
        run: async ({ admin, params }) => {
          const { rows } = await withAdminReader(pool, admin.uid, (tx) =>
            tx.query<z.infer<typeof ratingSchema> & { created_at: Date }>(
              `SELECT id, crew_id, trip_id, verdict, tags, status, created_at FROM driver_ratings
                WHERE listing_id = $1 ORDER BY created_at DESC LIMIT 500`,
              [params.id],
            ),
          );
          return {
            ratings: rows.map((row) => ({ ...row, created_at: row.created_at.toISOString() })),
          };
        },
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'hold_driver_ratings',
        schema: z.strictObject({
          listing_id: z.uuid(),
          rating_ids: z.array(z.uuid()).min(1).max(200),
        }),
        audit: (payload, result: { held: number }) => ({
          targetKind: 'driver_listing',
          targetId: payload.listing_id,
          detail: { rating_ids: payload.rating_ids, held: result.held },
          summary: `Held ${result.held} driver answers`,
        }),
        handle: async (tx, payload) => {
          const { rowCount } = await tx.query(
            `UPDATE driver_ratings SET status = 'held'
              WHERE listing_id = $1 AND id = ANY($2::uuid[]) AND status = 'visible'`,
            [payload.listing_id, payload.rating_ids],
          );
          await refreshStats(tx, payload.listing_id);
          return { held: rowCount ?? 0 };
        },
      }),
      defineAdminCommand({
        name: 'take_down_driver_listing',
        schema: z.strictObject({ listing_id: z.uuid(), reason: z.string().trim().min(1).max(500) }),
        audit: (payload) => ({
          targetKind: 'driver_listing',
          targetId: payload.listing_id,
          reason: payload.reason,
          summary: 'Took a driver listing down',
        }),
        handle: async (tx, payload) => {
          const { rowCount } = await tx.query(
            "UPDATE driver_listings SET status = 'removed' WHERE id = $1 AND status <> 'removed'",
            [payload.listing_id],
          );
          if (rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'driver_listing' });
          return { status: 'removed' as const };
        },
      }),
      defineAdminCommand({
        name: 'clear_driver_flag',
        schema: z.strictObject({ flag_id: z.uuid(), reason: z.string().trim().min(1).max(500) }),
        audit: (payload) => ({
          targetKind: 'driver_listing_flag',
          targetId: payload.flag_id,
          reason: payload.reason,
          summary: 'Cleared a driver listing flag',
        }),
        handle: async (tx, payload) => {
          const { rowCount } = await tx.query(
            `UPDATE driver_listing_flags SET status = 'cleared', cleared_reason = $2
              WHERE id = $1 AND status = 'open'`,
            [payload.flag_id, payload.reason],
          );
          if (rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'driver_listing_flag' });
          return { status: 'cleared' as const };
        },
      }),
    ],
  });
}
