/**
 * Incident and maintenance banners (docs/api-contracts.md §4.17, §5.9): `post_incident`,
 * `update_incident` and `resolve_incident` (ops), `GET /v1/admin/banners` (every role). While a
 * `read_only` maintenance window is open, `refuseDuringMaintenance` turns every other console
 * command away with `STATE_INVALID {reason: 'maintenance'}`; the owner's CLI door still works and
 * its commands are audited `via = cli` as always.
 */
import {
  DomainError,
  bannersResponseSchema,
  generateUuidV7,
  maintenanceAllows,
  postIncidentPayloadSchema,
  resolveIncidentPayloadSchema,
  updateIncidentPayloadSchema,
  type Banner,
  type IncidentKind,
} from '@cp/domain';
import type pg from 'pg';

import { withAdminReader } from './reads';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from './registry';

interface BannerRow {
  id: string;
  kind: IncidentKind;
  text: string;
  runbook_url: string | null;
  starts_at: Date;
  ends_at: Date | null;
  read_only: boolean;
  posted_by: string;
  posted_at: Date;
}

const OPEN_BANNERS = `SELECT id, kind, text, runbook_url, starts_at, ends_at, read_only, posted_by, posted_at
  FROM ops.incidents
  WHERE resolved_at IS NULL AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
  ORDER BY starts_at DESC, id DESC`;

/** Refuses a console command while a read-only maintenance window is open (CLI excepted). */
export async function refuseDuringMaintenance(
  pool: pg.Pool,
  adminUid: string,
  command: string,
  via: 'admin' | 'cli',
): Promise<void> {
  if (via === 'cli') return;
  const { rows } = await withAdminReader(pool, adminUid, (tx) =>
    tx.query<Pick<Banner, 'kind' | 'read_only'>>(
      `SELECT kind, read_only FROM ops.incidents
        WHERE resolved_at IS NULL AND read_only AND starts_at <= now()
          AND (ends_at IS NULL OR ends_at > now())`,
    ),
  );
  if (!maintenanceAllows(command, via, rows)) {
    throw new DomainError('STATE_INVALID', { reason: 'maintenance' });
  }
}

async function openIncident(tx: pg.PoolClient, id: string): Promise<BannerRow> {
  const { rows } = await tx.query<BannerRow>(
    'SELECT * FROM ops.incidents WHERE id = $1 AND resolved_at IS NULL FOR UPDATE',
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND');
  return row;
}

export function incidentsArea(pool: pg.Pool) {
  return defineAdminArea({
    id: 'incidents',
    reads: [
      defineAdminRead({
        path: '/banners',
        area: 'home',
        summary: 'Open incident and maintenance banners, newest first, and the on-call stamp',
        response: bannersResponseSchema,
        run: ({ admin, operators }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const { rows } = await tx.query<BannerRow>(OPEN_BANNERS);
            const onCall = await tx.query<{ value: unknown }>(
              "SELECT value FROM ops.ops_config WHERE key = 'ops.on_call'",
            );
            const emails = await operators.emails([...new Set(rows.map((row) => row.posted_by))]);
            const value = onCall.rows[0]?.value;
            return {
              items: rows.map((row) => ({
                id: row.id,
                kind: row.kind,
                text: row.text,
                runbook_url: row.runbook_url,
                starts_at: row.starts_at.toISOString(),
                ends_at: row.ends_at?.toISOString() ?? null,
                read_only: row.read_only,
                posted_by: emails.get(row.posted_by) ?? null,
                posted_at: row.posted_at.toISOString(),
              })),
              on_call: typeof value === 'string' && value.length > 0 ? value : null,
            };
          }),
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'post_incident',
        schema: postIncidentPayloadSchema,
        audit: (payload, result: { id: string }) => ({
          targetKind: 'incident',
          targetId: result.id,
          summary: `${payload.kind === 'maintenance' ? 'Maintenance' : 'Incident'}: ${payload.text}`,
          detail: { kind: payload.kind, read_only: payload.read_only },
        }),
        handle: async (tx, payload, ctx) => {
          const id = generateUuidV7();
          await tx.query(
            `INSERT INTO ops.incidents
               (id, kind, text, runbook_url, starts_at, ends_at, read_only, posted_by)
             VALUES ($1, $2, $3, $4, coalesce($5::timestamptz, now()), $6, $7, $8)`,
            [
              id,
              payload.kind,
              payload.text,
              payload.runbook_url ?? null,
              payload.starts_at ?? null,
              payload.ends_at ?? null,
              payload.read_only,
              ctx.admin.uid,
            ],
          );
          return { id };
        },
      }),
      defineAdminCommand({
        name: 'update_incident',
        schema: updateIncidentPayloadSchema,
        audit: (payload, result: { before: BannerRow }) => ({
          targetKind: 'incident',
          targetId: payload.id,
          summary: `Updated: ${payload.text ?? result.before.text}`,
          detail: {
            before: { text: result.before.text, read_only: result.before.read_only },
            after: {
              text: payload.text ?? result.before.text,
              read_only: payload.read_only ?? result.before.read_only,
            },
          },
        }),
        handle: async (tx, payload) => {
          const before = await openIncident(tx, payload.id);
          if (payload.read_only === true && before.kind !== 'maintenance') {
            throw new DomainError('VALIDATION', { reason: 'only_maintenance_read_only' });
          }
          await tx.query(
            `UPDATE ops.incidents SET
               text = coalesce($2, text),
               runbook_url = CASE WHEN $3 THEN $4 ELSE runbook_url END,
               ends_at = CASE WHEN $5 THEN $6::timestamptz ELSE ends_at END,
               read_only = coalesce($7, read_only),
               updated_at = now()
             WHERE id = $1`,
            [
              payload.id,
              payload.text ?? null,
              payload.runbook_url !== undefined,
              payload.runbook_url ?? null,
              payload.ends_at !== undefined,
              payload.ends_at ?? null,
              payload.read_only ?? null,
            ],
          );
          return { before };
        },
      }),
      defineAdminCommand({
        name: 'resolve_incident',
        schema: resolveIncidentPayloadSchema,
        audit: (payload, result: { text: string }) => ({
          targetKind: 'incident',
          targetId: payload.id,
          summary: `Resolved: ${result.text}`,
        }),
        handle: async (tx, payload, ctx) => {
          const row = await openIncident(tx, payload.id);
          await tx.query(
            `UPDATE ops.incidents SET resolved_by = $2, resolved_at = now(), updated_at = now()
              WHERE id = $1`,
            [payload.id, ctx.admin.uid],
          );
          return { text: row.text };
        },
      }),
    ],
  });
}
