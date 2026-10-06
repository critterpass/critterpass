/**
 * `GET /v1/admin/home` (every role): recent admin activity as one-line summaries (who, what,
 * when; never the audit detail, so support sees the summary without the diff), the services strip
 * (how many outside services are healthy, which are not) and AI spend today against its cap.
 */
import { SERVICES, adminHomeSchema, serviceStateAt, type ServiceState } from '@cp/domain';
import type pg from 'pg';

import { withAdminReader } from './reads';
import { defineAdminArea, defineAdminRead } from './registry';

const ACTIVITY_ROWS = 6;

export function homeArea(pool: pg.Pool) {
  return defineAdminArea({
    id: 'home',
    reads: [
      defineAdminRead({
        path: '/home',
        area: 'home',
        summary: 'Recent admin activity, the services strip and AI spend today',
        response: adminHomeSchema,
        run: ({ admin, operators }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const now = new Date();
            const activity = await tx.query<{
              id: string;
              admin_id: string | null;
              action: string;
              target_kind: string;
              summary: string | null;
              at: Date;
            }>(
              `SELECT id, admin_id, action, target_kind, detail ->> 'summary' AS summary, at
                 FROM ops.admin_audit WHERE admin_id IS NOT NULL
                ORDER BY at DESC, id DESC LIMIT $1`,
              [ACTIVITY_ROWS],
            );
            const emails = await operators.emails([
              ...new Set(activity.rows.flatMap((row) => (row.admin_id ? [row.admin_id] : []))),
            ]);
            const health = await tx.query<{ service: string; at: Date; state: ServiceState }>(
              `SELECT DISTINCT ON (service) service, at, state
                 FROM ops.service_health ORDER BY service, at DESC`,
            );
            const latest = new Map(health.rows.map((row) => [row.service, row]));
            const states = SERVICES.map((entry) => ({
              name: entry.name,
              state: serviceStateAt(latest.get(entry.key) ?? null, now),
            }));
            const spend = await tx.query<{ micros: string | null }>(
              "SELECT sum(cost_micros)::text AS micros FROM ai_usage WHERE at >= date_trunc('day', now())",
            );
            const cap = await tx.query<{ value: unknown }>(
              "SELECT value FROM ops.ops_config WHERE key = 'ai.cap.daily_usd'",
            );
            const capValue = cap.rows[0]?.value;
            return {
              activity: activity.rows.map((row) => ({
                id: row.id,
                operator: row.admin_id === null ? null : (emails.get(row.admin_id) ?? null),
                action: row.action,
                target_kind: row.target_kind,
                summary: row.summary ?? row.action.replaceAll('_', ' '),
                at: row.at.toISOString(),
              })),
              services: {
                total: states.length,
                ok: states.filter((entry) => entry.state === 'ok').length,
                attention: states
                  .filter((entry) => entry.state === 'degraded' || entry.state === 'down')
                  .map((entry) => ({ name: entry.name, state: entry.state })),
                unknown: states.filter((entry) => entry.state === 'unknown').length,
              },
              ai_today_micros: Number(spend.rows[0]?.micros ?? 0),
              ai_cap_usd: typeof capValue === 'number' ? capValue : null,
            };
          }),
      }),
    ],
    commands: [],
  });
}
