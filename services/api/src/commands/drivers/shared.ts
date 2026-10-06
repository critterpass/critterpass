/**
 * What the driver commands share: the caller must be an active member of the trip (RLS decides,
 * and a trip they cannot see answers `NOT_FOUND`), the field keyring that seals a driver's number,
 * and the one read of a trip driver.
 */
import { crypto as dbCrypto } from '@cp/db';
import { DomainError } from '@cp/domain';
import type pg from 'pg';

import type { buildFieldEncryptionKeyringFromEnv } from '../../auth/bootstrap';
import { asSystemRole } from '../../admin/command';

export type DriverKeyring = ReturnType<typeof buildFieldEncryptionKeyringFromEnv>;

export interface DriverDeps {
  /** Seals a driver's number at rest; without it the number is not kept. */
  readonly keyring: DriverKeyring;
}

export async function requireMember(tx: pg.PoolClient, tripId: string): Promise<void> {
  const { rows } = await tx.query<{ member: boolean }>(
    'SELECT app.is_trip_member($1) AS member',
    [tripId],
  );
  if (rows[0]?.member !== true) throw new DomainError('NOT_FOUND', { reason: 'trip' });
}

export const sealPhone = (deps: DriverDeps, phone: string | null): string | null =>
  phone === null || deps.keyring === undefined
    ? null
    : dbCrypto.encryptField(JSON.stringify({ phone }), deps.keyring);

export function openPhone(deps: DriverDeps, enc: string | null): string | null {
  if (enc === null || deps.keyring === undefined) return null;
  try {
    const value = JSON.parse(dbCrypto.decryptField(enc, deps.keyring)) as { phone?: unknown };
    return typeof value.phone === 'string' ? value.phone : null;
  } catch {
    return null;
  }
}

/** The trip's driver `providerId` (live, kind driver), or `NOT_FOUND`. */
export async function requireTripDriver(
  tx: pg.PoolClient,
  tripId: string,
  providerId: string,
): Promise<{ readonly name: string }> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ name: string }>(
      `SELECT name FROM providers
        WHERE id = $1 AND trip_id = $2 AND kind = 'driver' AND deleted_at IS NULL`,
      [providerId, tripId],
    ),
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'provider' });
  return row;
}
