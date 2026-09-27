/**
 * Support's time-boxed perk grants (`grant_entitlement` / `revoke_entitlement`). An active grant is
 * one more `EntitlementSource` for its user — Pass+ time until `until`, the same shape a redeemed
 * gift code resolves to — so the entitlement engine, not the console, decides what it unlocks.
 * Both commands recompute the user's materialised entitlements in the command's transaction.
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  GRANT_MAX_DAYS,
  type GrantEntitlementPayload,
  type GrantablePerk,
} from '@cp/domain';
import type { EntitlementSource } from '@cp/entitlements';
import type pg from 'pg';

import { recomputeUser, registerUserSourceLoader } from '../entitlements';

const DAY_MS = 24 * 60 * 60 * 1000;
let registered = false;

/** Registers the grant loader with the entitlement engine once per process (api boot). */
export function registerSupportGrantSource(): void {
  if (registered) return;
  registered = true;
  registerUserSourceLoader(async ({ tx, uid }): Promise<EntitlementSource[]> => {
    const { rows } = await tx.query<{ perk: GrantablePerk; until: Date }>(
      'SELECT perk, until FROM app.active_entitlement_grants($1)',
      [uid],
    );
    return rows.map((row) => ({ kind: 'code_grant', expiresAt: row.until.toISOString() }));
  });
}

export async function grantEntitlement(
  tx: pg.PoolClient,
  payload: GrantEntitlementPayload,
  adminUid: string,
  now: Date,
): Promise<{ grant_id: string; pass_plus: boolean }> {
  const until = new Date(payload.until);
  if (until.getTime() <= now.getTime()) {
    throw new DomainError('VALIDATION', { reason: 'until_in_past' });
  }
  if (until.getTime() - now.getTime() > GRANT_MAX_DAYS * DAY_MS) {
    throw new DomainError('VALIDATION', { reason: 'until_too_far', max_days: GRANT_MAX_DAYS });
  }
  const user = await tx.query('SELECT 1 FROM users WHERE id = $1', [payload.uid]);
  if (user.rowCount === 0) throw new DomainError('NOT_FOUND');
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO ops.entitlement_grants (user_id, perk, until, reason, granted_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [payload.uid, payload.perk, until, payload.reason, adminUid],
  );
  const grantId = rows[0]?.id;
  if (grantId === undefined) throw new Error('entitlement grant insert returned no row');
  const materialised = await recomputeUser(tx, payload.uid);
  await appendDomainEvent(tx, {
    type: 'entitlement.granted',
    aggregateKind: 'entitlement_grant',
    aggregateId: grantId,
    actorKind: 'system',
    actorId: adminUid,
    payload: {
      user_id: payload.uid,
      grant_id: grantId,
      perk: payload.perk,
      until: until.toISOString(),
    },
  });
  return { grant_id: grantId, pass_plus: materialised.passPlus };
}

export async function revokeEntitlement(
  tx: pg.PoolClient,
  payload: { uid: string; perk: GrantablePerk; reason: string },
  adminUid: string,
): Promise<{ revoked: number; pass_plus: boolean }> {
  const { rows } = await tx.query<{ id: string }>(
    `UPDATE ops.entitlement_grants
     SET revoked_at = now(), revoked_by = $3, revoke_reason = $4
     WHERE user_id = $1 AND perk = $2 AND revoked_at IS NULL AND until > now()
     RETURNING id`,
    [payload.uid, payload.perk, adminUid, payload.reason],
  );
  if (rows.length === 0) throw new DomainError('STATE_INVALID', { reason: 'no_active_grant' });
  const materialised = await recomputeUser(tx, payload.uid);
  for (const row of rows) {
    await appendDomainEvent(tx, {
      type: 'entitlement.revoked',
      aggregateKind: 'entitlement_grant',
      aggregateId: row.id,
      actorKind: 'system',
      actorId: adminUid,
      payload: { user_id: payload.uid, grant_id: row.id, perk: payload.perk },
    });
  }
  return { revoked: rows.length, pass_plus: materialised.passPlus };
}
