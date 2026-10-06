/**
 * The driver's own page, keyed by the link in his WhatsApp (6h-1, 6h-2). Every function runs as
 * app_system inside the caller's transaction.
 *
 * A key is either an invite token (before he confirms) or his listing key (after). Every change
 * rotates the listing key; the previous one keeps working for 24 hours, so another open tab still
 * saves. An invite he already used opens the "used" page, which can send a fresh key to his
 * number. Removing the listing hard-deletes it with its stats, flags and tips in one statement.
 */
import { crypto as dbCrypto } from '@cp/db';
import {
  combineCrewAnswer,
  DomainError,
  DRIVER_KEY_GRACE_HOURS,
  maskDriverPhone,
  phoneFromContact,
  type DriverClaimView,
  type DriverVehicle,
  type DriverVote,
} from '@cp/domain';
import type pg from 'pg';

import { hashToken, requireKeyring, type DriverDirectoryDeps } from './shared';

export type ResolvedKey =
  | {
      readonly kind: 'invite';
      readonly state: 'invited' | 'used' | 'expired' | 'invalid';
      readonly inviteId: string;
      readonly listingId: string | null;
    }
  | {
      readonly kind: 'listing';
      readonly state: 'listed' | 'paused' | 'removed';
      readonly listingId: string;
    }
  | { readonly kind: 'none'; readonly state: 'invalid' };

export async function resolveKey(tx: pg.PoolClient, key: string, now: Date): Promise<ResolvedKey> {
  const hash = hashToken(key);
  const listing = await tx.query<{
    id: string;
    status: 'listed' | 'paused' | 'removed' | 'pending';
  }>(
    `SELECT id, status FROM driver_listings
      WHERE key_hash = $1
         OR (prev_key_hash = $1 AND key_rotated_at > $2::timestamptz - make_interval(hours => $3))`,
    [hash, now, DRIVER_KEY_GRACE_HOURS],
  );
  const row = listing.rows[0];
  if (row !== undefined) {
    return {
      kind: 'listing',
      state: row.status === 'pending' ? 'listed' : row.status,
      listingId: row.id,
    };
  }
  const invite = await tx.query<{
    id: string;
    status: string;
    expires_at: Date;
    listing_id: string | null;
  }>('SELECT id, status, expires_at, listing_id FROM driver_invites WHERE token_hash = $1', [hash]);
  const found = invite.rows[0];
  if (found === undefined) return { kind: 'none', state: 'invalid' };
  const base = { kind: 'invite' as const, inviteId: found.id, listingId: found.listing_id };
  if (found.status === 'claimed')
    return { ...base, state: found.listing_id === null ? 'invalid' : 'used' };
  if (
    found.status === 'expired' ||
    ((found.status === 'sent' || found.status === 'opened') && found.expires_at <= now)
  ) {
    return { ...base, state: 'expired' };
  }
  if (found.status === 'sent' || found.status === 'opened') return { ...base, state: 'invited' };
  return { ...base, state: 'invalid' };
}

interface InviteContext {
  readonly provider_id: string;
  readonly crew_id: string;
  readonly phone_hash: string;
  readonly name: string;
  readonly contact_enc: string | null;
  readonly vehicle: DriverVehicle | null;
  readonly destination: string | null;
  readonly crew_size: number;
}

export async function inviteContext(tx: pg.PoolClient, inviteId: string): Promise<InviteContext> {
  const { rows } = await tx.query<InviteContext>(
    `SELECT i.provider_id, i.crew_id, i.phone_hash, p.name, p.contact_enc, p.vehicle,
            d.name AS destination,
            (SELECT count(*)::int FROM crew_members m WHERE m.crew_id = i.crew_id AND m.status = 'active') AS crew_size
       FROM driver_invites i
       JOIN providers p ON p.id = i.provider_id
       JOIN trips t ON t.id = i.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE i.id = $1`,
    [inviteId],
  );
  const context = rows[0];
  if (context === undefined) throw new DomainError('NOT_FOUND');
  return context;
}

/** The invited number, checked against the hash the invite was bound to. */
export async function invitedPhone(
  tx: pg.PoolClient,
  deps: DriverDirectoryDeps,
  inviteId: string,
): Promise<string> {
  const context = await inviteContext(tx, inviteId);
  const contact =
    context.contact_enc === null
      ? null
      : dbCrypto.decryptField(context.contact_enc, requireKeyring(deps));
  const phone = contact === null ? null : phoneFromContact(contact);
  if (
    phone === null ||
    deps.pepper === null ||
    dbCrypto.hashWithPepper(phone, deps.pepper) !== context.phone_hash
  ) {
    throw new DomainError('INVITE_REVOKED', { reason: 'number_changed' });
  }
  return phone;
}

export async function listingPhone(
  tx: pg.PoolClient,
  deps: DriverDirectoryDeps,
  listingId: string,
): Promise<string> {
  const { rows } = await tx.query<{ phone_e164_enc: string }>(
    'SELECT phone_e164_enc FROM driver_listings WHERE id = $1',
    [listingId],
  );
  const enc = rows[0]?.phone_e164_enc;
  if (enc === undefined) throw new DomainError('NOT_FOUND');
  return dbCrypto.decryptField(enc, requireKeyring(deps));
}

export async function inviteView(
  tx: pg.PoolClient,
  deps: DriverDirectoryDeps,
  inviteId: string,
): Promise<DriverClaimView> {
  await tx.query(
    // Only an invite nobody has opened yet moves to opened.
    `UPDATE driver_invites SET status = 'opened', opened_at = now()
      WHERE id = $1 AND opened_at IS NULL AND status NOT IN ('opened', 'claimed', 'declined', 'cancelled', 'expired')`,
    [inviteId],
  );
  const context = await inviteContext(tx, inviteId);
  const votes = await tx.query<DriverVote>(
    "SELECT verdict, tags FROM driver_ratings WHERE crew_id = $1 AND provider_id = $2 AND status = 'visible'",
    [context.crew_id, context.provider_id],
  );
  const answer = combineCrewAnswer(votes.rows);
  return {
    state: 'invited',
    crew_size: context.crew_size,
    masked_phone: maskDriverPhone(await invitedPhone(tx, deps, inviteId)),
    details: {
      display_name: context.name,
      areas: context.destination === null ? [] : [context.destination],
      languages: ['English'],
      ...(context.vehicle?.model === undefined ? {} : { vehicle_model: context.vehicle.model }),
      ...(context.vehicle?.seats === undefined ? {} : { seats: context.vehicle.seats }),
      day_trips: true,
    },
    show_ratings: true,
    crews_loved: votes.rows.filter((vote) => vote.verdict === 'loved').length,
    crews_rated: votes.rows.length,
    top_tags: answer?.tags ?? [],
  };
}

export async function listingView(
  tx: pg.PoolClient,
  listingId: string,
  nextKey?: string,
): Promise<DriverClaimView> {
  const { rows } = await tx.query<{
    status: 'listed' | 'paused' | 'removed' | 'pending';
    display_name: string;
    areas: string[];
    languages: string[];
    vehicle: DriverVehicle | null;
    seats: number | null;
    day_trips: boolean;
    price_text: string | null;
    show_ratings: boolean;
    crews_loved: number | null;
    crews_rated: number | null;
    top_tags: string[] | null;
  }>(
    `SELECT l.status, l.display_name, l.areas, l.languages, l.vehicle, l.seats, l.day_trips,
            l.price_text, l.show_ratings, s.crews_loved, s.crews_rated, s.top_tags
       FROM driver_listings l LEFT JOIN driver_listing_stats s ON s.listing_id = l.id WHERE l.id = $1`,
    [listingId],
  );
  const row = rows[0];
  if (row === undefined) return { state: 'removed' };
  if (row.status === 'removed') return { state: 'removed' };
  return {
    state: row.status === 'paused' ? 'paused' : 'listed',
    ...(nextKey === undefined ? {} : { next_key: nextKey }),
    details: {
      display_name: row.display_name,
      areas: row.areas,
      languages: row.languages,
      ...(row.vehicle?.model === undefined ? {} : { vehicle_model: row.vehicle.model }),
      ...(row.seats === null ? {} : { seats: row.seats }),
      day_trips: row.day_trips,
      ...(row.price_text === null ? {} : { price_text: row.price_text }),
    },
    show_ratings: row.show_ratings,
    crews_loved: row.crews_loved ?? 0,
    crews_rated: row.crews_rated ?? 0,
    top_tags: row.top_tags ?? [],
  };
}
