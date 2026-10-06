/**
 * "Our drivers" (6g-3): the trip's drivers with the crew's answers and each one's invite timeline.
 * Membership is proven by RLS (the trip and its providers are crew-visible); the listing status is
 * read as app_system, because a paused listing is hidden from members.
 */
import {
  DomainError,
  type DriverInviteStatus,
  type DriverVerdict,
  type OurDriver,
  type OurDrivers,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

interface DriverRow {
  id: string;
  name: string;
  day_numbers: number[] | null;
}

interface VoteRow {
  provider_id: string;
  user_id: string;
  verdict: DriverVerdict;
}

interface InviteRow {
  id: string;
  provider_id: string;
  listing_id: string | null;
  status: DriverInviteStatus;
  created_at: Date;
  opened_at: Date | null;
  expires_at: Date;
  nudged_at: Date | null;
}

export async function loadOurDrivers(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<OurDrivers> {
  const trip = await tx.query<{ crew_size: number }>(
    `SELECT (SELECT count(*)::int FROM crew_members m
              WHERE m.crew_id = t.crew_id AND m.status = 'active') AS crew_size
       FROM trips t WHERE t.id = $1`,
    [tripId],
  );
  const crewSize = trip.rows[0]?.crew_size;
  if (crewSize === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  const drivers = await tx.query<DriverRow>(
    `SELECT p.id, p.name,
            (SELECT array_agg(DISTINCT d.day_no ORDER BY d.day_no)
               FROM plan_items i JOIN plan_days d ON d.id = i.day_id
              WHERE i.provider_id = p.id AND i.trip_id = p.trip_id) AS day_numbers
       FROM providers p
      WHERE p.trip_id = $1 AND p.kind = 'driver' AND p.deleted_at IS NULL
      ORDER BY p.created_at`,
    [tripId],
  );
  const votes = await tx.query<VoteRow>(
    'SELECT provider_id, user_id, verdict FROM driver_ratings WHERE trip_id = $1',
    [tripId],
  );
  // The newest invite per driver is the one the timeline shows.
  const invites = await tx.query<InviteRow>(
    `SELECT DISTINCT ON (provider_id) id, provider_id, listing_id, status, created_at, opened_at,
            expires_at, nudged_at
       FROM driver_invites WHERE trip_id = $1
      ORDER BY provider_id, created_at DESC`,
    [tripId],
  );
  const listingIds = invites.rows.flatMap((row) =>
    row.listing_id === null ? [] : [row.listing_id],
  );
  const listings = await asSystemRole(tx, () =>
    tx.query<{ id: string; status: string }>(
      'SELECT id, status FROM driver_listings WHERE id = ANY($1::uuid[])',
      [listingIds],
    ),
  );
  const statusOf = new Map(listings.rows.map((row) => [row.id, row.status]));

  const result: OurDriver[] = drivers.rows.map((driver) => {
    const mine = votes.rows.filter((vote) => vote.provider_id === driver.id);
    const invite = invites.rows.find((row) => row.provider_id === driver.id);
    const listingId = invite?.listing_id ?? null;
    const listingStatus = listingId === null ? undefined : statusOf.get(listingId);
    return {
      provider_id: driver.id,
      name: driver.name,
      day_numbers: driver.day_numbers ?? [],
      crew_loved: mine.filter((vote) => vote.verdict === 'loved').length,
      crew_voters: mine.length,
      my_verdict: mine.find((vote) => vote.user_id === uid)?.verdict ?? null,
      listing_id: listingStatus === 'listed' || listingStatus === 'paused' ? listingId : null,
      listing_status:
        listingStatus === 'listed' || listingStatus === 'paused' ? listingStatus : null,
      invite:
        invite === undefined
          ? null
          : {
              id: invite.id,
              status: invite.status,
              sent_at: invite.created_at.toISOString(),
              opened_at: invite.opened_at?.toISOString() ?? null,
              expires_at: invite.expires_at.toISOString(),
              nudged_at: invite.nudged_at?.toISOString() ?? null,
            },
    };
  });
  return { trip_id: tripId, crew_size: crewSize, drivers: result };
}
