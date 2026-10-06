/**
 * Partner adapters area: one switch per supplier adapter. `set_partner_adapter` changes the row and
 * its public `supplier.<partner>.enabled` / `.copy_mode` keys in the same transaction, so the app's
 * copy switches exactly when the adapter does (docs/product-decisions.md §5).
 */
import { enqueueRealtime } from '@cp/db';
import {
  CATALOG_CHANNEL,
  DomainError,
  FLAG_AUDIENCE_ALL,
  partnerAdaptersResponseSchema,
  setPartnerAdapterPayloadSchema,
  supplierFlagKeys,
} from '@cp/domain';
import type pg from 'pg';

import { writeConfigKey } from './flags';
import { withAdminReader } from './reads';
import { lastSave } from './last-save';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from './registry';

interface AdapterRow {
  partner: string;
  enabled: boolean;
  copy_mode: string;
  approved_at: Date | null;
  certified_at: Date | null;
  notes: string | null;
  version: number;
  updated_at: Date;
  updated_by: string | null;
}

export function partnersArea(pool: pg.Pool) {
  return defineAdminArea({
    id: 'partners',
    reads: [
      defineAdminRead({
        path: '/partners',
        area: 'partners',
        summary: 'Supplier adapter switches',
        response: partnerAdaptersResponseSchema,
        run: async ({ admin, operators }) => {
          const rows = await withAdminReader(pool, admin.uid, async (tx) => {
            const result = await tx.query<AdapterRow>(
              `SELECT partner, enabled, copy_mode, approved_at, certified_at, notes, version, updated_at,
                      updated_by
               FROM ops.partner_adapters ORDER BY partner`,
            );
            return result.rows;
          });
          const editors = await operators.emails(
            rows.flatMap((row) => (row.updated_by ? [row.updated_by] : [])),
          );
          return partnerAdaptersResponseSchema.parse({
            items: rows.map((row) => ({
              ...row,
              approved_at: row.approved_at?.toISOString() ?? null,
              certified_at: row.certified_at?.toISOString() ?? null,
              updated_at: row.updated_at.toISOString(),
              updated_by: row.updated_by ? (editors.get(row.updated_by) ?? row.updated_by) : null,
            })),
          });
        },
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'set_partner_adapter',
        schema: setPartnerAdapterPayloadSchema,
        audit: (payload) => ({
          targetKind: 'partner_adapter',
          reason: payload.notes,
          detail: {
            partner: payload.partner,
            enabled: payload.enabled,
            copy_mode: payload.copy_mode,
            ...(payload.certified !== undefined ? { certified: payload.certified } : {}),
          },
        }),
        handle: async (tx, payload, ctx) => {
          if (payload.copy_mode === 'booking' && !payload.enabled) {
            throw new DomainError('STATE_INVALID', { reason: 'booking_copy_requires_enabled' });
          }
          const { rows } = await tx.query<{ version: number; certified_at: Date | null }>(
            'SELECT version, certified_at FROM ops.partner_adapters WHERE partner = $1 FOR UPDATE',
            [payload.partner],
          );
          const current = rows[0];
          if (current === undefined) throw new DomainError('NOT_FOUND');
          if (current.version !== payload.version) {
            throw new DomainError('VERSION_CONFLICT', {
              current_version: current.version,
              ...(await lastSave(tx, {
                action: 'set_partner_adapter',
                field: 'partner',
                value: payload.partner,
              })),
            });
          }
          const certified =
            payload.certified === undefined ? current.certified_at !== null : payload.certified;
          if (payload.copy_mode === 'booking' && !certified) {
            throw new DomainError('STATE_INVALID', {
              reason: 'booking_copy_requires_certification',
            });
          }
          const updated = await tx.query<{ version: number }>(
            `UPDATE ops.partner_adapters SET
               enabled = $2, copy_mode = $3, notes = $4, updated_by = $5, version = version + 1,
               approved_at = CASE WHEN $2 AND approved_at IS NULL THEN now() ELSE approved_at END,
               certified_at = CASE WHEN $6 THEN coalesce(certified_at, now()) ELSE NULL END
             WHERE partner = $1 RETURNING version`,
            [
              payload.partner,
              payload.enabled,
              payload.copy_mode,
              payload.notes,
              ctx.admin.uid,
              certified,
            ],
          );
          const keys = supplierFlagKeys(payload.partner);
          for (const [key, value] of [
            [keys.enabled, payload.enabled],
            [keys.copyMode, payload.copy_mode],
          ] as const) {
            await writeConfigKey(tx, {
              key,
              value,
              audience: FLAG_AUDIENCE_ALL,
              isPublic: true,
              adminUid: ctx.admin.uid,
            });
          }
          await enqueueRealtime(tx, {
            channel: CATALOG_CHANNEL,
            payload: { type: 'flag.changed', keys: [keys.enabled, keys.copyMode] },
          });
          return { partner: payload.partner, version: updated.rows[0]?.version ?? 0 };
        },
      }),
    ],
  });
}
