/**
 * Payout details over HTTPS only (never synced, never cached on a device's disk):
 * - `GET /v1/payments/{id}/payout`: the payer of an open payment reads the payee's methods through
 *   `app.reveal_payout`, which audits the read; anyone else gets `NOT_FOUND`.
 * - `GET /v1/me/payout-methods`: the owner's own methods, for the editor, default first.
 * Details are decrypted here, per request, and answered with `Cache-Control: no-store`.
 */
import { crypto as dbCrypto, withUser } from '@cp/db';
import { DomainError, type PayoutKind, type RevealedPayoutMethod } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';

export interface PayoutRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly keyring: dbCrypto.FieldEncryptionKeyring;
}

interface MethodRow {
  readonly method_id: string;
  readonly kind: PayoutKind;
  readonly country: string | null;
  readonly label: string;
  readonly details_enc: string | null;
  readonly is_default?: boolean;
}

function reveal(rows: readonly MethodRow[], deps: PayoutRouteDeps): RevealedPayoutMethod[] {
  return rows.map((row) => ({
    method_id: row.method_id,
    kind: row.kind,
    country: row.country,
    label: row.label,
    details:
      row.details_enc === null
        ? {}
        : (JSON.parse(
            dbCrypto.decryptField(row.details_enc, deps.keyring),
          ) as RevealedPayoutMethod['details']),
    ...(row.is_default === undefined ? {} : { is_default: row.is_default }),
  }));
}

export function registerPayoutRoutes(app: OpenAPIHono<AppEnv>, deps: PayoutRouteDeps): void {
  app.get('/v1/payments/:id/payout', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const paymentId = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/iu.test(paymentId)) {
      throw new DomainError('NOT_FOUND', { reason: 'payment' });
    }
    const rows = await withUser(deps.pool, session.uid, 'unknown', async (tx) => {
      const result = await tx.query<MethodRow>(
        `SELECT method_id, kind, country::text AS country, label, details_enc
           FROM app.reveal_payout($1)`,
        [paymentId],
      );
      return result.rows;
    });
    if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'payout' });
    c.header('Cache-Control', 'private, no-store');
    return c.json({ payment_id: paymentId, methods: reveal(rows, deps) });
  });

  app.get('/v1/me/payout-methods', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const rows = await withUser(deps.pool, session.uid, 'unknown', async (tx) => {
      const result = await tx.query<MethodRow>(
        `SELECT id AS method_id, kind, country::text AS country, label, details_enc, is_default
           FROM payout_methods WHERE user_id = $1 AND deleted_at IS NULL
          ORDER BY is_default DESC, kind`,
        [session.uid],
      );
      return result.rows;
    });
    c.header('Cache-Control', 'private, no-store');
    return c.json({ methods: reveal(rows, deps) });
  });
}
