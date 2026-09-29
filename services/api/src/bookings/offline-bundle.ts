/**
 * `GET /v1/trips/{trip_id}/offline-bundle` (docs/api-contracts.md §5.5): what a member's device
 * downloads so the trip works in airplane mode. The bundle is a set of named sections; this area
 * registers `bookings`: every booking the caller can see (their own and the crew's), a fresh signed
 * URL for each document (15 minutes, enough to download it now), and, for the caller's own bookings
 * only, the barcode decrypted for the device's local-only store. Nothing here is cached by any
 * proxy (`no-store`); the barcode never leaves in any other response.
 */
import { crypto as dbCrypto, withSystem, withUser } from '@cp/db';
import { DomainError } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';
import { mintReadUrl, READ_URL_TTL_SECONDS, type MediaSigningConfig } from '../media/sign';

type FieldKeyring = Parameters<typeof dbCrypto.decryptField>[1];

export interface OfflineBundleContext {
  readonly uid: string;
  readonly tripId: string;
  readonly now: Date;
}

export interface OfflineBundleDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly keyring?: FieldKeyring | undefined;
  readonly signing?: MediaSigningConfig | undefined;
}

export type OfflineBundleSection = (
  deps: OfflineBundleDeps,
  context: OfflineBundleContext,
) => Promise<unknown>;

const sections = new Map<string, OfflineBundleSection>();

/** Adds a named section to every bundle (once per name, at boot). */
export function registerOfflineBundleSection(name: string, build: OfflineBundleSection): void {
  sections.set(name, build);
}

export interface BundledAttachment {
  readonly attachment_id: string;
  readonly media_key: string;
  readonly kind: string;
  readonly url: string | null;
  readonly url_expires_at: string | null;
}

export interface BundledBooking {
  readonly booking_id: string;
  readonly version: number;
  readonly attachments: BundledAttachment[];
  /** Present on the caller's own bookings that carry one. */
  readonly barcode: { readonly format: string; readonly payload: string } | null;
}

async function bookingsSection(
  deps: OfflineBundleDeps,
  context: OfflineBundleContext,
): Promise<{ items: BundledBooking[] }> {
  const visible = await withUser(deps.pool, context.uid, 'offline-bundle', async (tx) => {
    const bookings = await tx.query<{ id: string; version: number; owner_id: string }>(
      `SELECT id, version, owner_id FROM bookings WHERE trip_id = $1 ORDER BY starts_at NULLS LAST, id`,
      [context.tripId],
    );
    const attachments = await tx.query<{
      id: string;
      booking_id: string;
      media_key: string;
      kind: string;
    }>('SELECT id, booking_id, media_key, kind FROM booking_attachments WHERE trip_id = $1', [
      context.tripId,
    ]);
    return { bookings: bookings.rows, attachments: attachments.rows };
  });
  const own = visible.bookings.filter((row) => row.owner_id === context.uid).map((row) => row.id);
  const barcodes =
    own.length === 0 || deps.keyring === undefined
      ? new Map<string, { format: string; payload: string }>()
      : await withSystem(deps.pool, async (tx) => {
          const { rows } = await tx.query<{ id: string; format: string; sealed: string }>(
            `SELECT id, barcode_format AS format, barcode_payload_enc AS sealed FROM bookings
              WHERE id = ANY($1) AND owner_id = $2 AND barcode_payload_enc IS NOT NULL`,
            [own, context.uid],
          );
          const keyring = deps.keyring as FieldKeyring;
          return new Map(
            rows.map((row) => [
              row.id,
              { format: row.format, payload: dbCrypto.decryptField(row.sealed, keyring) },
            ]),
          );
        });
  const expiresAt = Math.floor(context.now.getTime() / 1000) + READ_URL_TTL_SECONDS;
  const items: BundledBooking[] = [];
  for (const booking of visible.bookings) {
    const attachments: BundledAttachment[] = [];
    for (const attachment of visible.attachments.filter((a) => a.booking_id === booking.id)) {
      const url =
        deps.signing === undefined
          ? null
          : await mintReadUrl(deps.signing, attachment.media_key, expiresAt);
      attachments.push({
        attachment_id: attachment.id,
        media_key: attachment.media_key,
        kind: attachment.kind,
        url,
        url_expires_at: url === null ? null : new Date(expiresAt * 1000).toISOString(),
      });
    }
    items.push({
      booking_id: booking.id,
      version: booking.version,
      attachments,
      barcode: barcodes.get(booking.id) ?? null,
    });
  }
  return { items };
}

registerOfflineBundleSection('bookings', bookingsSection);

const params = z.object({ trip_id: z.uuid() });

export function registerOfflineBundleRoute(app: OpenAPIHono<AppEnv>, deps: OfflineBundleDeps) {
  app.get('/v1/trips/:trip_id/offline-bundle', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const { trip_id: tripId } = params.parse(c.req.param());
    const member = await withUser(deps.pool, session.uid, 'offline-bundle', async (tx) => {
      const { rows } = await tx.query<{ member: boolean }>(
        'SELECT app.is_trip_member($1) AS member',
        [tripId],
      );
      return rows[0]?.member === true;
    });
    if (!member) throw new DomainError('NOT_FOUND', { reason: 'trip' });
    const now = new Date();
    const context = { uid: session.uid, tripId, now };
    const built: Record<string, unknown> = {};
    for (const [name, build] of sections) built[name] = await build(deps, context);
    c.header('Cache-Control', 'private, no-store');
    return c.json({ trip_id: tripId, generated_at: now.toISOString(), sections: built });
  });
}
