/**
 * `GET /v1/me/private/insurance` (docs/api-contracts.md §5.5): the owner's live policies with the
 * number and assistance line decrypted, for the device's local-only store (read offline in Help and
 * the wallet). Nobody else's, never cached by a proxy, never synced.
 */
import { crypto as dbCrypto, withSystem } from '@cp/db';
import type { PrivateInsuranceWire } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import type { FieldKeyring } from '../commands/bookings/deps';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';

export function registerPrivateInsuranceRoute(
  app: OpenAPIHono<AppEnv>,
  deps: {
    readonly pool: pg.Pool;
    readonly sessions: SessionResolver;
    readonly keyring: FieldKeyring;
  },
): void {
  app.get('/v1/me/private/insurance', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const rows = await withSystem(deps.pool, async (tx) => {
      const result = await tx.query<{
        id: string;
        trip_id: string | null;
        provider: string;
        policy_no_enc: string;
        assistance_phone_enc: string | null;
        doc_media_key: string | null;
        updated_at: Date;
      }>(
        `SELECT id, trip_id, provider, policy_no_enc, assistance_phone_enc, doc_media_key, updated_at
           FROM insurance_policies WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`,
        [session.uid],
      );
      return result.rows;
    });
    const policies = rows.map((row): PrivateInsuranceWire => ({
      policy_id: row.id,
      trip_id: row.trip_id,
      provider: row.provider,
      policy_no: dbCrypto.decryptField(row.policy_no_enc, deps.keyring),
      assistance_phone:
        row.assistance_phone_enc === null
          ? null
          : dbCrypto.decryptField(row.assistance_phone_enc, deps.keyring),
      doc_media_key: row.doc_media_key,
      updated_at: row.updated_at.toISOString(),
    }));
    c.header('Cache-Control', 'private, no-store');
    return c.json({ policies });
  });
}
