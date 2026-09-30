/**
 * `GET /v1/me/private/dietary` (docs/api-contracts.md §5.5): the owner's own dietary profile, notes
 * decrypted, for the device's `local_private` store. Read as the owner (RLS), never cached by a
 * proxy, never synced; `NOT_FOUND` until a profile is set.
 */
import { crypto as dbCrypto, withUser } from '@cp/db';
import { DomainError, type PrivateDietaryWire } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../../app';
import type { FieldKeyring } from '../bookings/deps';
import { requireCommandSession, type SessionResolver } from '../_framework/session';

interface ProfileRow {
  readonly diet: PrivateDietaryWire['diet'];
  readonly allergies: string[];
  readonly avoid: string[];
  readonly spice: PrivateDietaryWire['spice'];
  readonly accessibility_notes_enc: string | null;
  readonly visibility: PrivateDietaryWire['visibility'];
  readonly consent_at: Date | null;
  readonly updated_at: Date;
}

export function registerPrivateDietaryRoute(
  app: OpenAPIHono<AppEnv>,
  deps: {
    readonly pool: pg.Pool;
    readonly sessions: SessionResolver;
    readonly keyring: FieldKeyring;
  },
): void {
  app.get('/v1/me/private/dietary', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const { rows } = await withUser(deps.pool, uid, 'unknown', (tx) =>
      tx.query<ProfileRow>(
        `SELECT diet, allergies, avoid, spice, accessibility_notes_enc, visibility, consent_at,
                updated_at
           FROM dietary_profiles WHERE user_id = $1`,
        [uid],
      ),
    );
    const row = rows[0];
    if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'not_set' });
    const body: PrivateDietaryWire = {
      diet: row.diet,
      allergies: row.allergies,
      avoid: row.avoid,
      spice: row.spice,
      accessibility_notes:
        row.accessibility_notes_enc === null
          ? null
          : dbCrypto.decryptField(row.accessibility_notes_enc, deps.keyring),
      visibility: row.visibility,
      consent_at: row.consent_at?.toISOString() ?? null,
      updated_at: row.updated_at.toISOString(),
    };
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });
}
