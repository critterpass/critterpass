/**
 * The writes behind the driver's own page: saying yes (the listing goes live and the crews' answers
 * link to it), changing details, pausing, the key rotation every change makes, removing the listing
 * (a hard delete; stats, flags and tips cascade) and declining the invite. All run as app_system.
 */
import { crypto as dbCrypto } from '@cp/db';
import {
  DomainError,
  DRIVER_CONSENT_VERSION,
  type DriverClaimDetails,
  type DriverClaimView,
} from '@cp/domain';
import type pg from 'pg';

import { inviteContext, invitedPhone, listingView } from './claim-store';
import {
  hashToken,
  newLinkToken,
  refreshListingStats,
  requireKeyring,
  type DriverDirectoryDeps,
} from './shared';

function detailColumns(details: DriverClaimDetails): unknown[] {
  const vehicle =
    details.vehicle_model === undefined && details.seats === undefined
      ? null
      : {
          ...(details.vehicle_model === undefined ? {} : { model: details.vehicle_model }),
          ...(details.seats === undefined ? {} : { seats: details.seats }),
        };
  return [
    details.display_name,
    details.areas,
    details.languages,
    vehicle,
    details.seats ?? null,
    details.day_trips,
    details.price_text ?? null,
  ];
}

/** A new key for the listing; the one just used stays valid for the grace window. */
export async function rotateKey(
  tx: pg.PoolClient,
  listingId: string,
  name: string,
): Promise<string> {
  const key = newLinkToken(name);
  await tx.query(
    'UPDATE driver_listings SET prev_key_hash = key_hash, key_hash = $2, key_rotated_at = now() WHERE id = $1',
    [listingId, hashToken(key)],
  );
  return key;
}

/** He said yes with a verified code: the listing goes live and the crews' answers link to it. */
export async function confirmClaim(
  tx: pg.PoolClient,
  deps: DriverDirectoryDeps,
  inviteId: string,
  input: { details: DriverClaimDetails; show_ratings: boolean; lang: 'en' | 'id' },
): Promise<DriverClaimView> {
  const phone = await invitedPhone(tx, deps, inviteId);
  const context = await inviteContext(tx, inviteId);
  const key = newLinkToken(input.details.display_name);
  const existing = await tx.query<{ id: string; status: string }>(
    'SELECT id, status FROM driver_listings WHERE phone_hash = $1',
    [context.phone_hash],
  );
  if (existing.rows[0]?.status === 'removed')
    throw new DomainError('STATE_INVALID', { reason: 'taken_down' });
  const columns = detailColumns(input.details);
  const saved = await tx.query<{ id: string }>(
    `INSERT INTO driver_listings
       (display_name, areas, languages, vehicle, seats, day_trips, price_text, phone_e164_enc,
        phone_hash, status, show_ratings, consent_version, consent_at, key_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'listed', $10, $11, now(), $12)
     ON CONFLICT (phone_hash) DO UPDATE SET display_name = EXCLUDED.display_name,
       areas = EXCLUDED.areas, languages = EXCLUDED.languages, vehicle = EXCLUDED.vehicle,
       seats = EXCLUDED.seats, day_trips = EXCLUDED.day_trips, price_text = EXCLUDED.price_text,
       show_ratings = EXCLUDED.show_ratings, consent_version = EXCLUDED.consent_version,
       consent_at = now(), prev_key_hash = driver_listings.key_hash, key_hash = EXCLUDED.key_hash,
       key_rotated_at = now()
     RETURNING id`,
    [
      ...columns,
      dbCrypto.encryptField(phone, requireKeyring(deps)),
      context.phone_hash,
      input.show_ratings,
      `${DRIVER_CONSENT_VERSION}:${input.lang}`,
      hashToken(key),
    ],
  );
  const listingId = saved.rows[0]?.id ?? '';
  await tx.query(
    `UPDATE driver_invites SET status = 'claimed', claimed_at = now(), listing_id = $2 WHERE id = $1`,
    [inviteId, listingId],
  );
  await tx.query(
    'UPDATE driver_invites SET listing_id = $2 WHERE phone_hash = $1 AND listing_id IS NULL',
    [context.phone_hash, listingId],
  );
  const providers = `SELECT provider_id FROM driver_invites WHERE phone_hash = $1`;
  await tx.query(
    `UPDATE driver_ratings SET listing_id = $2 WHERE listing_id IS NULL AND provider_id IN (${providers})`,
    [context.phone_hash, listingId],
  );
  await tx.query(
    `UPDATE driver_tips SET listing_id = $2 WHERE listing_id IS NULL AND provider_id IN (${providers})`,
    [context.phone_hash, listingId],
  );
  await refreshListingStats(tx, listingId);
  return listingView(tx, listingId, key);
}

export async function updateListing(
  tx: pg.PoolClient,
  listingId: string,
  change: {
    details?: DriverClaimDetails | undefined;
    show_ratings?: boolean | undefined;
    paused?: boolean | undefined;
  },
): Promise<DriverClaimView> {
  if (change.details !== undefined) {
    await tx.query(
      `UPDATE driver_listings SET display_name = $2, areas = $3, languages = $4, vehicle = $5,
         seats = $6, day_trips = $7, price_text = $8 WHERE id = $1`,
      [listingId, ...detailColumns(change.details)],
    );
  }
  if (change.show_ratings !== undefined) {
    await tx.query('UPDATE driver_listings SET show_ratings = $2 WHERE id = $1', [
      listingId,
      change.show_ratings,
    ]);
  }
  if (change.paused !== undefined) {
    await tx.query(
      `UPDATE driver_listings SET status = $2 WHERE id = $1 AND status IN ('listed', 'paused')`,
      [listingId, change.paused ? 'paused' : 'listed'],
    );
  }
  const name = await tx.query<{ display_name: string }>(
    'SELECT display_name FROM driver_listings WHERE id = $1',
    [listingId],
  );
  return listingView(
    tx,
    listingId,
    await rotateKey(tx, listingId, name.rows[0]?.display_name ?? 'driver'),
  );
}

/** Hard-deletes the listing; stats, flags and tips cascade, crews keep their own answers. */
export async function removeListing(tx: pg.PoolClient, listingId: string): Promise<void> {
  await tx.query(
    "DELETE FROM driver_listings WHERE id = $1 AND status IN ('listed', 'paused', 'pending')",
    [listingId],
  );
}

export async function declineInvite(tx: pg.PoolClient, inviteId: string): Promise<void> {
  await tx.query("DELETE FROM driver_invites WHERE id = $1 AND status IN ('sent', 'opened')", [
    inviteId,
  ]);
}
