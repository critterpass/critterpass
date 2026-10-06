/**
 * `rate_driver {trip_id, provider_id, verdict, tags, tip?}` (6g-1): a member answers the driver's
 * card once the trip has ended. Each member's answer is kept (the crew's combined answer is computed
 * from them); answering again replaces it. One tip per crew per driver per trip, the latest writer's,
 * held as `pending` until the automated check passes it. Only accounts with a verified phone answer,
 * so one person cannot rate from throwaway accounts.
 */
import { sendInTx } from '@cp/db';
import { DomainError, DRIVER_RATING_TRIP_STATUSES, rateDriverPayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import {
  driverPhone,
  loadCrewDriver,
  phoneHash,
  refreshListingStats,
  type CrewDriver,
  type DriverDirectoryDeps,
} from './shared';

export const DRIVER_TIP_CONTENT_KIND = 'driver_tip';
const COMPLIANCE_CHECK_QUEUE = 'compliance.check';

/**
 * The listing of the crew's driver, if he confirmed one: through the crew's own claimed invite, or
 * by his phone (a driver the crew picked from the directory, or one another crew invited). Runs as
 * app_system.
 */
export async function linkedListingId(
  tx: pg.PoolClient,
  deps: DriverDirectoryDeps,
  driver: CrewDriver,
): Promise<string | null> {
  const { rows } = await tx.query<{ listing_id: string }>(
    `SELECT listing_id FROM driver_invites
      WHERE crew_id = $1 AND provider_id = $2 AND listing_id IS NOT NULL
     LIMIT 1`,
    [driver.crew_id, driver.id],
  );
  if (rows[0] !== undefined) return rows[0].listing_id;
  if (driver.contact_enc === null || deps.keyring === null || deps.pepper === null) return null;
  let hash: string;
  try {
    hash = phoneHash(deps, driverPhone(deps, driver));
  } catch {
    return null;
  }
  const listed = await tx.query<{ id: string }>(
    'SELECT id FROM driver_listings WHERE phone_hash = $1',
    [hash],
  );
  return listed.rows[0]?.id ?? null;
}

async function assertVerifiedPhone(tx: pg.PoolClient, uid: string): Promise<void> {
  const { rows } = await tx.query<{ verified: boolean }>(
    'SELECT phone_hash IS NOT NULL AS verified FROM user_private WHERE user_id = $1',
    [uid],
  );
  if (rows[0]?.verified !== true) {
    throw new DomainError('NOT_ELIGIBLE', { reason: 'phone_unverified' });
  }
}

export function createRateDriverCommand(deps: DriverDirectoryDeps) {
  return defineCommand({
    name: 'rate_driver',
    v: 1,
    schema: rateDriverPayloadSchema,
    offline: true,
    authorize: async (tx, payload) => {
      const driver = await loadCrewDriver(tx, payload.trip_id, payload.provider_id);
      if (!(DRIVER_RATING_TRIP_STATUSES as readonly string[]).includes(driver.trip_status)) {
        throw new DomainError('NOT_ELIGIBLE', { reason: 'trip_not_ended' });
      }
    },
    handle: async (tx, payload, ctx): Promise<{ rating_id: string; tip_id: string | null }> => {
      const driver = await loadCrewDriver(tx, payload.trip_id, payload.provider_id);
      return asSystemRole(tx, async () => {
        await assertVerifiedPhone(tx, ctx.uid);
        const listingId = await linkedListingId(tx, deps, driver);
        const tags = [...new Set(payload.tags)];
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO driver_ratings (listing_id, provider_id, trip_id, crew_id, user_id, verdict, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (provider_id, trip_id, user_id) DO UPDATE
           SET verdict = EXCLUDED.verdict, tags = EXCLUDED.tags,
               listing_id = coalesce(driver_ratings.listing_id, EXCLUDED.listing_id)
         RETURNING id`,
          [listingId, driver.id, driver.trip_id, driver.crew_id, ctx.uid, payload.verdict, tags],
        );
        const ratingId = rows[0]?.id ?? '';
        let tipId: string | null = null;
        const tip = payload.tip?.trim() ?? '';
        if (tip !== '') {
          const saved = await tx.query<{ id: string }>(
            `INSERT INTO driver_tips (listing_id, provider_id, trip_id, crew_id, author_id, text, crew_size, month)
           SELECT $1, $2, t.id, t.crew_id, $4, $5,
                  greatest(1, least(60, (SELECT count(*) FROM crew_members m
                     WHERE m.crew_id = t.crew_id AND m.status = 'active'))),
                  date_trunc('month', coalesce(t.end_date, current_date))::date
             FROM trips t WHERE t.id = $3
           ON CONFLICT (provider_id, trip_id) DO UPDATE
             SET text = EXCLUDED.text, author_id = EXCLUDED.author_id, status = 'pending'
           RETURNING id`,
            [listingId, driver.id, driver.trip_id, ctx.uid, tip],
          );
          tipId = saved.rows[0]?.id ?? null;
          if (tipId !== null) {
            await sendInTx(
              tx,
              COMPLIANCE_CHECK_QUEUE,
              { content_kind: DRIVER_TIP_CONTENT_KIND, content_id: tipId },
              { singletonKey: `${DRIVER_TIP_CONTENT_KIND}:${tipId}` },
            );
          }
        }
        if (listingId !== null) await refreshListingStats(tx, listingId);
        return { rating_id: ratingId, tip_id: tipId };
      });
    },
  });
}
