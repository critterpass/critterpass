/**
 * Driver plan links on the server: tokens (random, found by their SHA-256, sealed with the field
 * keyring so the crew can copy the link again), the crew's view of a share and the driver's view
 * of the plan, always built by `projectDriverView` from the trip's current version.
 */
import { createHash, randomBytes } from 'node:crypto';

import { crypto as dbCrypto } from '@cp/db';
import {
  DomainError,
  driverPlanPath,
  type DriverPlanQuote,
  type DriverPlanShare,
  type DriverView,
  linkHostsFor,
  type LinkEnvironment,
} from '@cp/domain';
import { projectDriverView, type DriverViewPlace } from '@cp/planner';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { loadPlanState } from '../../plan/versioning';
import type { FieldKeyring } from '../bookings/deps';

export interface DriverPlanDeps {
  readonly keyring: FieldKeyring;
  readonly linkEnv: LinkEnvironment;
}

export function newShareToken(): string {
  return randomBytes(18).toString('base64url');
}

export function shareTokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export function shareUrl(linkEnv: LinkEnvironment, token: string): string {
  return `https://${linkHostsFor(linkEnv)[0]}${driverPlanPath(token)}`;
}

export interface ShareRow {
  readonly id: string;
  readonly trip_id: string;
  readonly provider_id: string | null;
  readonly driver_name: string;
  readonly created_by: string | null;
  readonly itinerary_version_id: string;
  readonly day_nos: number[];
  readonly token_enc: string;
  readonly allow_quote: boolean;
  readonly expires_at: Date;
  readonly revoked_at: Date | null;
  readonly open_count: number;
  readonly last_opened_at: Date | null;
  readonly pdf_key: string | null;
  readonly pdf_version_id: string | null;
}

const SHARE_COLUMNS = `id, trip_id, provider_id, driver_name, created_by, itinerary_version_id, day_nos,
  token_enc, allow_quote, expires_at, revoked_at, open_count, last_opened_at, pdf_key, pdf_version_id`;

export async function loadShare(
  tx: pg.PoolClient,
  where: { id: string } | { tokenHash: Buffer },
  lock = false,
): Promise<ShareRow | null> {
  const [clause, value] = 'id' in where ? ['id', where.id] : ['token_hash', where.tokenHash];
  return asSystemRole(tx, async () => {
    const { rows } = await tx.query<ShareRow>(
      `SELECT ${SHARE_COLUMNS} FROM driver_plan_shares WHERE ${clause} = $1${lock ? ' FOR UPDATE' : ''}`,
      [value],
    );
    return rows[0] ?? null;
  });
}

/** A share that was just written, as the crew sees it. */
export async function crewShareById(
  tx: pg.PoolClient,
  id: string,
  deps: DriverPlanDeps,
  now: Date,
): Promise<DriverPlanShare> {
  const row = await loadShare(tx, { id });
  if (row === null) throw new DomainError('NOT_FOUND', { reason: 'driver_plan_share' });
  return toCrewShare(row, deps, now);
}

export function toCrewShare(row: ShareRow, deps: DriverPlanDeps, now: Date): DriverPlanShare {
  const live = row.revoked_at === null && row.expires_at > now;
  return {
    id: row.id,
    trip_id: row.trip_id,
    provider_id: row.provider_id,
    driver_name: row.driver_name,
    day_nos: row.day_nos,
    allow_quote: row.allow_quote,
    expires_at: row.expires_at.toISOString(),
    revoked_at: row.revoked_at?.toISOString() ?? null,
    open_count: row.open_count,
    last_opened_at: row.last_opened_at?.toISOString() ?? null,
    url: live ? shareUrl(deps.linkEnv, dbCrypto.decryptField(row.token_enc, deps.keyring)) : null,
  };
}

/** Throws the switched-off errors with the facts the page may show. */
export async function assertShareLive(
  tx: pg.PoolClient,
  row: ShareRow | null,
  now: Date,
): Promise<ShareRow> {
  if (row === null) throw new DomainError('NOT_FOUND', { reason: 'driver_plan' });
  if (row.revoked_at === null && row.expires_at > now) return row;
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ display_name: string | null; reply_at: Date | null }>(
      `SELECT u.display_name,
              (SELECT max(created_at) FROM driver_plan_replies
                WHERE share_id = $1 AND status = 'open') AS reply_at
         FROM (SELECT 1) one LEFT JOIN users u ON u.id = $2`,
      [row.id, row.created_by],
    ),
  );
  const revoked = row.revoked_at !== null && row.revoked_at <= row.expires_at;
  throw new DomainError(revoked ? 'SHARE_REVOKED' : 'SHARE_EXPIRED', {
    sharer_first_name: rows[0]?.display_name?.trim().split(/\s+/u)[0] ?? '',
    off_at: (row.revoked_at !== null && revoked ? row.revoked_at : row.expires_at).toISOString(),
    reply_at: rows[0]?.reply_at?.toISOString() ?? null,
  });
}

interface PlaceRow {
  id: string;
  name: string;
  name_local: string | null;
  address: string | null;
  category: string;
  lat: number;
  lng: number;
}

export interface DriverViewResult {
  readonly view: DriverView;
  readonly versionId: string;
  readonly tz: string;
}

/** The driver's view of the share's days on the trip's current plan. */
export async function buildDriverView(
  tx: pg.PoolClient,
  share: ShareRow,
): Promise<DriverViewResult> {
  return asSystemRole(tx, async () => {
    const trip = await tx.query<{ current_version_id: string | null; tz: string | null }>(
      `SELECT t.current_version_id, coalesce(t.tz, d.tz) AS tz
         FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
      [share.trip_id],
    );
    const versionId = trip.rows[0]?.current_version_id ?? share.itinerary_version_id;
    const tz = trip.rows[0]?.tz ?? 'UTC';
    const state = await loadPlanState(tx, versionId);
    const poiIds = [...new Set(state.items.flatMap((i) => (i.poi_id ? [i.poi_id] : [])))];
    const [places, people, sharer, mustDos, terms] = await Promise.all([
      tx.query<PlaceRow>(
        'SELECT id, name, name_local, address, category, lat, lng FROM pois WHERE id = ANY($1::uuid[])',
        [poiIds],
      ),
      tx.query<{ display_name: string | null }>(
        `SELECT u.display_name FROM trip_participants p JOIN users u ON u.id = p.user_id
          WHERE p.trip_id = $1 AND p.holds_seat ORDER BY p.created_at`,
        [share.trip_id],
      ),
      tx.query<{ display_name: string | null }>('SELECT display_name FROM users WHERE id = $1', [
        share.created_by,
      ]),
      tx.query<{ id: string; title: string }>(
        'SELECT id, title FROM must_dos WHERE trip_id = $1 AND deleted_at IS NULL',
        [share.trip_id],
      ),
      acceptedTerms(tx, share.id),
    ]);
    const placeMap = new Map<string, DriverViewPlace>(
      places.rows.map((p) => [
        p.id,
        {
          name: p.name,
          nameLocal: p.name_local,
          address: p.address,
          category: p.category,
          lat: p.lat,
          lng: p.lng,
        },
      ]),
    );
    const view = projectDriverView({
      sharerDisplayName: sharer.rows[0]?.display_name ?? null,
      travellers: people.rows.map((p) => ({ displayName: p.display_name })),
      mustDos: new Map(mustDos.rows.map((m) => [m.id, m.title])),
      dayNos: share.day_nos,
      state,
      places: placeMap,
      tz,
      terms,
    });
    return { view, versionId, tz };
  });
}

/** The driver's own terms, once the crew said yes to a quote from this link. */
async function acceptedTerms(tx: pg.PoolClient, shareId: string): Promise<DriverPlanQuote | null> {
  const { rows } = await tx.query<{
    price_per_day_minor: string;
    currency: string;
    includes: DriverPlanQuote['includes'];
    overtime_per_hour_minor: string | null;
    included_hours: number | null;
    car: string | null;
  }>(
    `SELECT r.price_per_day_minor, r.currency, r.includes, r.overtime_per_hour_minor,
            r.included_hours, r.car
       FROM driver_plan_replies r JOIN change_sets c ON c.id = r.change_set_id
      WHERE r.share_id = $1 AND r.status = 'decided' AND c.status = 'applied'
        AND r.price_per_day_minor IS NOT NULL
      ORDER BY r.created_at DESC LIMIT 1`,
    [shareId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    price_per_day_minor: Number(row.price_per_day_minor),
    currency: row.currency,
    includes: row.includes,
    overtime_per_hour_minor:
      row.overtime_per_hour_minor === null ? null : Number(row.overtime_per_hour_minor),
    included_hours: row.included_hours,
    car: row.car,
  };
}
