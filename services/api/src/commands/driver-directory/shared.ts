/**
 * What the driver-directory commands and routes share: the deps (field keyring for phone
 * envelopes, the phone pepper, the link environment), link tokens, the trip's driver provider as
 * the crew sees it, and the stats refresh.
 */
import { createHash, randomBytes } from 'node:crypto';

import { crypto as dbCrypto } from '@cp/db';
import {
  computeListingStats,
  DomainError,
  DRIVER_CLAIM_PATH_PREFIX,
  LINK_ENVIRONMENT_CONFIG,
  LISTING_RATING_VOTES_SQL,
  listingStatsParams,
  phoneFromContact,
  UPSERT_LISTING_STATS_SQL,
  type LinkEnvironment,
  type ListingRatingVote,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

export interface DriverDirectoryDeps {
  readonly keyring: dbCrypto.FieldEncryptionKeyring | null;
  readonly pepper: string | null;
  readonly linkEnv: LinkEnvironment;
}

export function requireKeyring(deps: DriverDirectoryDeps): dbCrypto.FieldEncryptionKeyring {
  if (deps.keyring === null) {
    throw new DomainError('SUPPLIER_UNAVAILABLE', { reason: 'field_encryption_not_configured' });
  }
  return deps.keyring;
}

export function phoneHash(deps: DriverDirectoryDeps, e164: string): string {
  if (deps.pepper === null) {
    throw new DomainError('SUPPLIER_UNAVAILABLE', { reason: 'phone_pepper_not_configured' });
  }
  return dbCrypto.hashWithPepper(e164, deps.pepper);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** `made-7k2qx9vd4m3p`: the driver's first name so he recognises it, then 80 random bits. */
export function newLinkToken(name: string): string {
  const slug =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .find((part) => part.length > 0)
      ?.slice(0, 16) ?? 'driver';
  const random = randomBytes(10)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  return `${slug}-${random}`;
}

export function claimUrl(env: LinkEnvironment, token: string): string {
  return `https://${LINK_ENVIRONMENT_CONFIG[env].primaryHost}${DRIVER_CLAIM_PATH_PREFIX}${token}`;
}

export interface CrewDriver {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly name: string;
  readonly contact_enc: string | null;
  readonly trip_status: string;
}

/** The trip's driver as app_system, after the caller proved membership through RLS. */
export async function loadCrewDriver(
  tx: pg.PoolClient,
  tripId: string,
  providerId: string,
): Promise<CrewDriver> {
  const visible = await tx.query(
    `SELECT 1 FROM providers WHERE id = $1 AND trip_id = $2 AND kind = 'driver'`,
    [providerId, tripId],
  );
  if (visible.rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'driver' });
  return asSystemRole(tx, async () => {
    const { rows } = await tx.query<CrewDriver>(
      `SELECT p.id, p.trip_id, t.crew_id, p.name, p.contact_enc, t.status AS trip_status
         FROM providers p JOIN trips t ON t.id = p.trip_id
        WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [providerId],
    );
    const driver = rows[0];
    if (driver === undefined) throw new DomainError('NOT_FOUND', { reason: 'driver' });
    return driver;
  });
}

export function driverPhone(deps: DriverDirectoryDeps, driver: CrewDriver): string {
  if (driver.contact_enc === null) {
    throw new DomainError('STATE_INVALID', { reason: 'driver_has_no_phone' });
  }
  const phone = phoneFromContact(dbCrypto.decryptField(driver.contact_enc, requireKeyring(deps)));
  if (phone === null) throw new DomainError('STATE_INVALID', { reason: 'driver_has_no_phone' });
  return phone;
}

/** Runs as app_system. */
export async function refreshListingStats(tx: pg.PoolClient, listingId: string): Promise<void> {
  const { rows } = await tx.query<ListingRatingVote>(LISTING_RATING_VOTES_SQL, [listingId]);
  await tx.query(
    UPSERT_LISTING_STATS_SQL,
    listingStatsParams(listingId, computeListingStats(rows)),
  );
}
