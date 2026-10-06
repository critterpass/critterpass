/**
 * `create_driver_plan_share`, `update_driver_plan_share`, `revoke_driver_plan_share` (doc delta):
 * any member of the trip shares the chosen days with a driver or guide. One live link per driver
 * per trip, so a new link revokes the old one; revoking switches the page off on its next request.
 * Rows are written as the system after the member check: the table has no app_user write path.
 */
import {
  createDriverPlanSharePayloadSchema,
  DomainError,
  generateUuidV7,
  revokeDriverPlanSharePayloadSchema,
  updateDriverPlanSharePayloadSchema,
  type DriverPlanShare,
} from '@cp/domain';
import { crypto as dbCrypto } from '@cp/db';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { requireTripMember } from '../../plan/access';
import { publishPlan } from '../../plan/changeset-store';
import { defineCommand } from '../_framework/define-command';
import {
  crewShareById,
  loadShare,
  newShareToken,
  shareTokenHash,
  toCrewShare,
  type DriverPlanDeps,
} from './store';

export const DRIVER_SHARE_RT = 'driver_share.changed';
const DAY_MS = 86_400_000;

async function planDayNos(tx: pg.PoolClient, versionId: string): Promise<Set<number>> {
  const { rows } = await tx.query<{ day_no: number }>(
    'SELECT day_no FROM plan_days WHERE version_id = $1',
    [versionId],
  );
  return new Set(rows.map((r) => r.day_no));
}

async function requireShareMember(tx: pg.PoolClient, shareId: string) {
  const row = await loadShare(tx, { id: shareId }, true);
  if (row === null) throw new DomainError('NOT_FOUND', { reason: 'driver_plan_share' });
  await requireTripMember(tx, row.trip_id);
  return row;
}

export function createDriverPlanShareCommands(deps: DriverPlanDeps) {
  const create = defineCommand({
    name: 'create_driver_plan_share',
    v: 1,
    schema: createDriverPlanSharePayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      await requireTripMember(tx, payload.trip_id);
    },
    handle: async (tx, payload, ctx): Promise<DriverPlanShare> => {
      const now = ctx.clock.serverNow;
      const id = payload.share_id ?? generateUuidV7();
      const existing = await loadShare(tx, { id });
      if (existing !== null) return toCrewShare(existing, deps, now);
      const token = newShareToken();
      await asSystemRole(tx, async () => {
        const trip = await tx.query<{ current_version_id: string | null }>(
          'SELECT current_version_id FROM trips WHERE id = $1 FOR UPDATE',
          [payload.trip_id],
        );
        const versionId = trip.rows[0]?.current_version_id ?? null;
        if (versionId === null) throw new DomainError('STATE_INVALID', { reason: 'no_plan' });
        const days = await planDayNos(tx, versionId);
        const dayNos = [...new Set(payload.day_nos)]
          .filter((d) => days.has(d))
          .sort((a, b) => a - b);
        if (dayNos.length === 0) throw new DomainError('VALIDATION', { reason: 'no_days' });
        if (payload.provider_id) {
          const provider = await tx.query(
            'SELECT 1 FROM providers WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL',
            [payload.provider_id, payload.trip_id],
          );
          if (provider.rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'provider' });
        }
        await tx.query(
          `UPDATE driver_plan_shares SET revoked_at = $4
            WHERE trip_id = $1 AND revoked_at IS NULL
              AND COALESCE(provider_id::text, lower(driver_name)) = COALESCE($2::text, lower($3))`,
          [payload.trip_id, payload.provider_id ?? null, payload.driver_name, now],
        );
        await tx.query(
          `INSERT INTO driver_plan_shares (id, trip_id, provider_id, driver_name, created_by,
             itinerary_version_id, day_nos, token_hash, token_enc, allow_quote, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id,
            payload.trip_id,
            payload.provider_id ?? null,
            payload.driver_name,
            ctx.uid,
            versionId,
            dayNos,
            shareTokenHash(token),
            dbCrypto.encryptField(token, deps.keyring),
            payload.allow_quote,
            new Date(now.getTime() + payload.expires_in_days * DAY_MS),
          ],
        );
      });
      await publishPlan(tx, payload.trip_id, DRIVER_SHARE_RT, { share_id: id });
      return crewShareById(tx, id, deps, now);
    },
  });

  const update = defineCommand({
    name: 'update_driver_plan_share',
    v: 1,
    schema: updateDriverPlanSharePayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      await requireShareMember(tx, payload.share_id);
    },
    handle: async (tx, payload, ctx): Promise<DriverPlanShare> => {
      const now = ctx.clock.serverNow;
      const row = await requireShareMember(tx, payload.share_id);
      if (row.revoked_at !== null) throw new DomainError('STATE_INVALID', { state: 'revoked' });
      let dayNos: number[] | null = null;
      if (payload.day_nos !== undefined) {
        const days = await asSystemRole(tx, () => planDayNos(tx, row.itinerary_version_id));
        dayNos = [...new Set(payload.day_nos)].filter((d) => days.has(d)).sort((a, b) => a - b);
        if (dayNos.length === 0) throw new DomainError('VALIDATION', { reason: 'no_days' });
      }
      // A new expiry counts from now, capped like a new link.
      const expiresAt =
        payload.expires_in_days === undefined
          ? null
          : new Date(now.getTime() + payload.expires_in_days * DAY_MS);
      await asSystemRole(tx, () =>
        tx.query(
          `UPDATE driver_plan_shares
              SET day_nos = COALESCE($2, day_nos), expires_at = COALESCE($3, expires_at),
                  allow_quote = COALESCE($4, allow_quote), version = version + 1,
                  pdf_key = CASE WHEN $2::smallint[] IS NULL THEN pdf_key END
            WHERE id = $1`,
          [row.id, dayNos, expiresAt, payload.allow_quote ?? null],
        ),
      );
      await publishPlan(tx, row.trip_id, DRIVER_SHARE_RT, { share_id: row.id });
      return crewShareById(tx, row.id, deps, now);
    },
  });

  const revoke = defineCommand({
    name: 'revoke_driver_plan_share',
    v: 1,
    schema: revokeDriverPlanSharePayloadSchema,
    offline: true,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      await requireShareMember(tx, payload.share_id);
    },
    handle: async (tx, payload, ctx): Promise<DriverPlanShare> => {
      const now = ctx.clock.serverNow;
      const row = await requireShareMember(tx, payload.share_id);
      if (row.revoked_at === null) {
        await asSystemRole(tx, () =>
          tx.query('UPDATE driver_plan_shares SET revoked_at = $2 WHERE id = $1', [row.id, now]),
        );
        await publishPlan(tx, row.trip_id, DRIVER_SHARE_RT, { share_id: row.id });
      }
      return crewShareById(tx, row.id, deps, now);
    },
  });

  return { create, update, revoke };
}
