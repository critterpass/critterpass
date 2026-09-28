/**
 * Flags & config area: the typed `ops_config` keys with their current value, audience, version,
 * last editor and what the app currently syncs (`client_config`), and `set_feature_flag` with an
 * optimistic-concurrency check. A change reaches clients through `client_config` (the table's
 * trigger) and one `flag.changed` message on the `catalog` channel. Every change is audited with
 * its previous value and audience, which `GET /flags/{key}/history` reads back.
 */
import { enqueueRealtime } from '@cp/db';
import {
  CATALOG_CHANNEL,
  CONFIG_KEYS,
  DomainError,
  FLAG_AUDIENCE_ALL,
  adminAuditViaSchema,
  adminFlagsResponseSchema,
  auditChangeSchema,
  auditValueLabel,
  canSetConfigKey,
  changesFrom,
  configKey,
  flagAudienceSchema,
  flagHistoryResponseSchema,
  setFeatureFlagPayloadSchema,
  type AuditChange,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { withAdminReader } from './reads';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from './registry';

interface ConfigRow {
  key: string;
  value: unknown;
  audience: unknown;
  version: number;
  updated_at: Date;
  updated_by: string | null;
  client_value: unknown;
  projected: boolean;
}

/** Upserts one key as the operator and bumps its version; returns the new version. */
export async function writeConfigKey(
  tx: pg.PoolClient,
  input: { key: string; value: unknown; audience: unknown; isPublic: boolean; adminUid: string },
): Promise<number> {
  const { rows } = await tx.query<{ version: number }>(
    `INSERT INTO ops.ops_config (key, value, is_public, audience, updated_by)
     VALUES ($1, $2::jsonb, $3, $4::jsonb, $5)
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value, is_public = EXCLUDED.is_public, audience = EXCLUDED.audience,
       updated_by = EXCLUDED.updated_by, version = ops.ops_config.version + 1
     RETURNING version`,
    [
      input.key,
      JSON.stringify(input.value),
      input.isPublic,
      JSON.stringify(input.audience),
      input.adminUid,
    ],
  );
  return rows[0]?.version ?? 0;
}

const HISTORY_LIMIT = 100;

const storedDetailSchema = z.looseObject({
  summary: z.string().optional(),
  changes: z.array(auditChangeSchema).optional(),
  via: adminAuditViaSchema.optional(),
});

/** "guide.free_daily_limit · 30 → 40", or the audience change when the value stayed. */
function flagSummary(key: string, changes: readonly AuditChange[]): string {
  const change = changes.find((entry) => entry.field === 'value') ?? changes[0];
  if (change === undefined) return `${key} · unchanged`;
  const field = change.field === 'value' ? '' : `${change.field} `;
  return `${key} · ${field}${auditValueLabel(change.before)} → ${auditValueLabel(change.after)}`;
}

/** The flags list; `services` keys (kill switches, caps, ops timings) have their own screen. */
const flagKeys = Object.entries(CONFIG_KEYS).filter(
  ([, definition]) => definition.group !== 'services',
);

export function flagsArea(pool: pg.Pool) {
  return defineAdminArea({
    id: 'flags',
    reads: [
      defineAdminRead({
        path: '/flags',
        area: 'flags',
        summary: 'Typed config keys with their values, audiences and client projection',
        response: adminFlagsResponseSchema,
        run: async ({ admin, operators }) => {
          const rows = await withAdminReader(pool, admin.uid, async (tx) => {
            const result = await tx.query<ConfigRow>(
              `SELECT c.key, c.value, c.audience, c.version, c.updated_at, c.updated_by,
                      cc.value AS client_value, cc.key IS NOT NULL AS projected
               FROM ops.ops_config c LEFT JOIN client_config cc ON cc.key = c.key
               WHERE c.key = ANY($1::text[])`,
              [flagKeys.map(([key]) => key)],
            );
            return new Map(result.rows.map((row) => [row.key, row]));
          });
          const editors = await operators.emails(
            [...rows.values()].flatMap((row) => (row.updated_by ? [row.updated_by] : [])),
          );
          return {
            items: flagKeys.map(([key, definition]) => {
              const row = rows.get(key);
              const audience = flagAudienceSchema.safeParse(row?.audience);
              return {
                key,
                description: definition.description,
                is_public: definition.isPublic,
                critical: definition.critical,
                managed_by: definition.managedBy ?? null,
                group: definition.group,
                roles: definition.roles ? [...definition.roles] : null,
                note: definition.note ?? null,
                value: row?.value ?? null,
                audience: audience.success ? audience.data : FLAG_AUDIENCE_ALL,
                version: row?.version ?? 0,
                client_value: row?.projected ? row.client_value : null,
                updated_at: row ? row.updated_at.toISOString() : null,
                updated_by: row?.updated_by
                  ? (editors.get(row.updated_by) ?? row.updated_by)
                  : null,
              };
            }),
          };
        },
      }),
      defineAdminRead({
        path: '/flags/{key}/history',
        area: 'flags',
        summary: "One key's changes, newest first, with the value before and after",
        params: z.object({ key: z.string().min(1).max(128) }),
        response: flagHistoryResponseSchema,
        run: async ({ admin, operators, params }) => {
          const { rows } = await withAdminReader(pool, admin.uid, (tx) =>
            tx.query<{ at: Date; admin_id: string; reason: string | null; detail: unknown }>(
              `SELECT at, admin_id, reason, detail FROM ops.admin_audit
               WHERE action = 'set_feature_flag' AND detail->>'key' = $1
               ORDER BY at DESC, id DESC LIMIT $2`,
              [params.key, HISTORY_LIMIT],
            ),
          );
          const editors = await operators.emails(rows.map((row) => row.admin_id));
          return {
            items: rows.map((row) => {
              const detail = storedDetailSchema.safeParse(row.detail);
              const changes = detail.success ? (detail.data.changes ?? []) : [];
              return {
                at: row.at.toISOString(),
                admin: editors.get(row.admin_id) ?? row.admin_id,
                summary:
                  (detail.success ? detail.data.summary : undefined) ??
                  flagSummary(params.key, changes),
                changes,
                reason: row.reason,
                via: (detail.success ? detail.data.via : undefined) ?? null,
              };
            }),
          };
        },
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'set_feature_flag',
        schema: setFeatureFlagPayloadSchema,
        audit: (payload, result: { changes: AuditChange[] }) => ({
          targetKind: 'config',
          reason: payload.reason ?? null,
          detail: { key: payload.key, value: payload.value, audience: payload.audience },
          summary: flagSummary(payload.key, result.changes),
          changes: result.changes,
        }),
        handle: async (tx, payload, ctx) => {
          const definition = configKey(payload.key);
          if (definition === undefined) {
            throw new DomainError('VALIDATION', { reason: 'unknown_key', key: payload.key });
          }
          const allowed = canSetConfigKey(ctx.admin.roles, definition.roles);
          if (!allowed.ok)
            throw new DomainError(allowed.deny, { reason: 'key_role', key: payload.key });
          if (definition.managedBy !== undefined) {
            throw new DomainError('STATE_INVALID', {
              reason: `managed_by_${definition.managedBy}`,
            });
          }
          const value: unknown = definition.schema.parse(payload.value);
          const { rows } = await tx.query<{ version: number; value: unknown; audience: unknown }>(
            'SELECT version, value, audience FROM ops.ops_config WHERE key = $1 FOR UPDATE',
            [payload.key],
          );
          const current = rows[0];
          if ((current?.version ?? 0) !== payload.version) {
            throw new DomainError('VERSION_CONFLICT', {
              current_version: current?.version ?? 0,
              current: { value: current?.value ?? null, audience: current?.audience ?? null },
            });
          }
          const version = await writeConfigKey(tx, {
            key: payload.key,
            value,
            audience: payload.audience,
            isPublic: definition.isPublic,
            adminUid: ctx.admin.uid,
          });
          await enqueueRealtime(tx, {
            channel: CATALOG_CHANNEL,
            payload: { type: 'flag.changed', keys: [payload.key] },
          });
          const changes = changesFrom(current ?? null, { value, audience: payload.audience }, [
            'value',
            'audience',
          ]);
          return { key: payload.key, version, changes };
        },
      }),
    ],
  });
}
