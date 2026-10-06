/**
 * Services & spend (`GET /v1/admin/services`, ops): every outside service with its latest health
 * snapshot, its switch and month-to-date spend; AI spend by tier and route from `ai_usage`; and
 * `set_vendor_cost` (owner) for fixed monthly plans. A value with no source is null (`unknown` for
 * health), never estimated.
 */
import {
  AI_ROUTES,
  CAPPED_TIERS,
  SERVICES,
  SERVICE_HEALTH_STALE_MINUTES,
  serviceStateAt,
  servicesResponseSchema,
  setVendorCostPayloadSchema,
  type ServiceState,
} from '@cp/domain';
import type pg from 'pg';

import { withAdminReader } from './reads';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from './registry';

const MICROS_PER_MINOR = 10_000;

async function configValues(tx: pg.PoolClient, keys: readonly string[]) {
  const { rows } = await tx.query<{ key: string; value: unknown }>(
    'SELECT key, value FROM ops.ops_config WHERE key = ANY($1::text[])',
    [keys],
  );
  return new Map(rows.map((row) => [row.key, row.value]));
}

const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
/** Kill switches are on unless set to false. */
const on = (value: unknown): boolean => value !== false;

async function readServices(tx: pg.PoolClient, now: Date) {
  const switchKeys = [
    ...SERVICES.flatMap((entry) => (entry.switch_key === undefined ? [] : [entry.switch_key])),
    ...AI_ROUTES.map((route) => `ai.${route}.enabled`),
    ...CAPPED_TIERS.flatMap((tier) => [`ai.tier.${tier}.enabled`, `ai.cap.${tier}.daily_usd`]),
    'ai.cap.daily_usd',
    'spend.month_budget_usd',
  ];
  const config = await configValues(tx, switchKeys);

  const health = await tx.query<{
    service: string;
    at: Date;
    state: ServiceState;
    p95_ms: number | null;
    error_rate: string | null;
    quota_used_pct: string | null;
  }>(
    `SELECT DISTINCT ON (service) service, at, state, p95_ms, error_rate, quota_used_pct
       FROM ops.service_health ORDER BY service, at DESC`,
  );
  const latest = new Map(health.rows.map((row) => [row.service, row]));

  const spend = await tx.query<{ service: string; micros: string; currency: string }>(
    `SELECT service, sum(amount_micros)::text AS micros, min(currency) AS currency
       FROM ops.vendor_spend_daily
      WHERE day >= date_trunc('month', now())::date
      GROUP BY service`,
  );
  const vendorSpend = new Map(spend.rows.map((row) => [row.service, row]));

  const tiers = await tx.query<{ tier: string; micros: string }>(
    `SELECT tier, sum(cost_micros)::text AS micros FROM ai_usage
      WHERE at >= date_trunc('day', now()) GROUP BY tier`,
  );
  const tierToday = new Map(tiers.rows.map((row) => [row.tier, Number(row.micros)]));

  const month = await tx.query<{ tier: string; micros: string }>(
    `SELECT tier, sum(cost_micros)::text AS micros FROM ai_usage
      WHERE at >= date_trunc('month', now()) GROUP BY tier`,
  );
  // Each AI vendor's month is its tiers' sum: DeepSeek runs the generation tiers.
  const aiVendorMonth = new Map<string, number>();
  for (const row of month.rows) {
    const vendor = row.tier === 'jev' ? 'jev' : row.tier === 'gemini' ? 'gemini' : 'deepseek';
    aiVendorMonth.set(vendor, (aiVendorMonth.get(vendor) ?? 0) + Number(row.micros));
  }
  const aiMonth = [...aiVendorMonth.values()].reduce((total, micros) => total + micros, 0);

  const days = await tx.query<{ day: string; tier: string; micros: string }>(
    `SELECT to_char(date_trunc('day', at), 'YYYY-MM-DD') AS day, tier, sum(cost_micros)::text AS micros
       FROM ai_usage WHERE at >= date_trunc('day', now()) - interval '13 days'
      GROUP BY 1, 2 ORDER BY 1`,
  );
  const byDay = new Map<string, Record<string, number>>();
  for (let offset = 13; offset >= 0; offset -= 1) {
    const day = new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    byDay.set(day, {});
  }
  for (const row of days.rows) {
    const entry = byDay.get(row.day);
    if (entry !== undefined) entry[row.tier] = Number(row.micros);
  }

  const routes = await tx.query<{ route: string; tier: string; calls: number; micros: string }>(
    `SELECT route, mode() WITHIN GROUP (ORDER BY tier) AS tier, count(*)::int AS calls,
            sum(cost_micros)::text AS micros
       FROM ai_usage WHERE at >= date_trunc('day', now()) AND route IS NOT NULL
      GROUP BY route`,
  );
  const routeToday = new Map(routes.rows.map((row) => [row.route, row]));

  const vendorMonth = spend.rows
    .filter((row) => row.currency === 'USD')
    .reduce((total, row) => total + Number(row.micros), 0);
  const aiToday = [...tierToday.values()].reduce((total, micros) => total + micros, 0);

  return {
    month_spend_micros: aiMonth + vendorMonth,
    month_budget_usd: num(config.get('spend.month_budget_usd')),
    ai_today_micros: aiToday,
    ai_cap_usd: num(config.get('ai.cap.daily_usd')),
    tiers: CAPPED_TIERS.map((tier) => ({
      tier,
      today_micros: tierToday.get(tier) ?? 0,
      cap_usd: num(config.get(`ai.cap.${tier}.daily_usd`)),
      enabled: on(config.get(`ai.tier.${tier}.enabled`)),
    })),
    ai_days: [...byDay].map(([day, by_tier]) => ({ day, by_tier })),
    routes: AI_ROUTES.map((route) => {
      const today = routeToday.get(route);
      return {
        route,
        tier: today?.tier ?? null,
        calls_today: today?.calls ?? 0,
        today_micros: Number(today?.micros ?? 0),
        switch_key: `ai.${route}.enabled`,
        enabled: on(config.get(`ai.${route}.enabled`)),
      };
    }),
    services: SERVICES.map((entry) => {
      const snapshot = latest.get(entry.key) ?? null;
      const state = serviceStateAt(snapshot, now);
      // A fresh snapshot can carry quota use while its state is still unknown (no calls yet).
      const fresh =
        snapshot !== null &&
        now.getTime() - snapshot.at.getTime() <= SERVICE_HEALTH_STALE_MINUTES * 60_000;
      const paid = vendorSpend.get(entry.key);
      const aiSpend = aiVendorMonth.get(entry.key) ?? null;
      return {
        key: entry.key,
        name: entry.name,
        group: entry.group,
        purpose: entry.purpose,
        switch_key: entry.switch_key ?? null,
        switch_on: entry.switch_key === undefined ? null : on(config.get(entry.switch_key)),
        state,
        checked_at: snapshot?.at.toISOString() ?? null,
        p95_ms: fresh ? snapshot.p95_ms : null,
        error_rate: fresh && snapshot.error_rate !== null ? Number(snapshot.error_rate) : null,
        quota_used_pct:
          fresh && snapshot.quota_used_pct !== null ? Number(snapshot.quota_used_pct) : null,
        month_spend:
          paid !== undefined
            ? {
                amount_minor: Math.round(Number(paid.micros) / MICROS_PER_MINOR),
                currency: paid.currency,
              }
            : aiSpend !== null && aiSpend > 0
              ? { amount_minor: Math.round(aiSpend / MICROS_PER_MINOR), currency: 'USD' }
              : null,
      };
    }),
  };
}

export function servicesArea(pool: pg.Pool) {
  return defineAdminArea({
    id: 'services',
    reads: [
      defineAdminRead({
        path: '/services',
        area: 'services',
        summary: 'Outside services: health, switches and spend; AI spend by tier and route',
        response: servicesResponseSchema,
        run: ({ admin }) => withAdminReader(pool, admin.uid, (tx) => readServices(tx, new Date())),
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'set_vendor_cost',
        schema: setVendorCostPayloadSchema,
        audit: (payload) => ({
          targetKind: 'vendor_cost',
          targetId: null,
          summary: `${payload.service} ${payload.month} · ${(payload.amount_minor / 100).toFixed(2)} ${payload.currency}`,
          detail: { service: payload.service, month: payload.month, note: payload.note ?? null },
        }),
        handle: async (tx, payload) => {
          await tx.query(
            `INSERT INTO ops.vendor_spend_daily (service, day, amount_micros, currency, source, note)
             VALUES ($1, ($2 || '-01')::date, $3, $4, 'manual', $5)
             ON CONFLICT (service, day, source) DO UPDATE SET
               amount_micros = EXCLUDED.amount_micros, currency = EXCLUDED.currency,
               note = EXCLUDED.note, updated_at = now()`,
            [
              payload.service,
              payload.month,
              payload.amount_minor * MICROS_PER_MINOR,
              payload.currency,
              payload.note ?? null,
            ],
          );
          return { booked: true };
        },
      }),
    ],
  });
}
