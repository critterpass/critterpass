/**
 * Flags & config area: the typed `ops_config` keys with their current value, audience, version,
 * last editor and what the app currently syncs (`client_config`), and `set_feature_flag` with an
 * optimistic-concurrency check. A change reaches clients through `client_config` (the table's
 * trigger) and one `flag.changed` message on the `catalog` channel.
 */
import { enqueueRealtime } from '@cp/db';
import {
  CATALOG_CHANNEL,
  CONFIG_KEYS,
  DomainError,
  FLAG_AUDIENCE_ALL,
  adminFlagsResponseSchema,
  configKey,
  flagAudienceSchema,
  setFeatureFlagPayloadSchema,
} from '@cp/domain';
import type pg from 'pg';

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
              [Object.keys(CONFIG_KEYS)],
            );
            return new Map(result.rows.map((row) => [row.key, row]));
          });
          const editors = await operators.emails(
            [...rows.values()].flatMap((row) => (row.updated_by ? [row.updated_by] : [])),
          );
          return {
            items: Object.entries(CONFIG_KEYS).map(([key, definition]) => {
              const row = rows.get(key);
              const audience = flagAudienceSchema.safeParse(row?.audience);
              return {
                key,
                description: definition.description,
                is_public: definition.isPublic,
                critical: definition.critical,
                managed_by: definition.managedBy ?? null,
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
    ],
    commands: [
      defineAdminCommand({
        name: 'set_feature_flag',
        schema: setFeatureFlagPayloadSchema,
        audit: (payload) => ({
          targetKind: 'config',
          detail: { key: payload.key, value: payload.value, audience: payload.audience },
        }),
        handle: async (tx, payload, ctx) => {
          const definition = configKey(payload.key);
          if (definition === undefined) {
            throw new DomainError('VALIDATION', { reason: 'unknown_key', key: payload.key });
          }
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
          return { key: payload.key, version };
        },
      }),
    ],
  });
}
