/**
 * Every outside service CritterPass calls, for the console's Services & spend screen. A static
 * list, not a table: adding a vendor is one entry. `health` says where its state comes from
 * (`probe`: a free status endpoint; `metrics`: our own call counters; `none`: nothing measured, so
 * it always shows `unknown`). `switch_key` names the kill switch that turns our use of it off.
 */
import { z } from 'zod';

import { SERVICES } from './service-list';

export const SERVICE_GROUPS = [
  'ai',
  'messaging',
  'push',
  'payments',
  'maps_travel',
  'suppliers',
  'mail_print',
  'infrastructure',
] as const;
export type ServiceGroup = (typeof SERVICE_GROUPS)[number];

export const SERVICE_GROUP_LABELS: Readonly<Record<ServiceGroup, string>> = {
  ai: 'AI & search',
  messaging: 'Messaging & sign-in',
  push: 'Push',
  payments: 'Payments',
  maps_travel: 'Maps & travel data',
  suppliers: 'Suppliers',
  mail_print: 'Mail & print',
  infrastructure: 'Infrastructure & observability',
};

export interface ServiceEntry {
  readonly key: string;
  readonly name: string;
  readonly group: ServiceGroup;
  readonly purpose: string;
  readonly switch_key?: string;
  readonly health: 'probe' | 'metrics' | 'none';
  /** The vendor has a usage or billing API the hourly poller reads. */
  readonly usage_api?: boolean;
  /** Hosts our outbound calls reach; their counters feed a `metrics` service's state. */
  readonly hosts?: readonly string[];
  /** A `probe` service whose state is the worst of these services' states (hosting platforms). */
  readonly derived_from?: readonly string[];
}

export { SERVICES };

export const SERVICE_STATES = ['ok', 'degraded', 'down', 'unknown'] as const;
export const serviceStateSchema = z.enum(SERVICE_STATES);
export type ServiceState = z.infer<typeof serviceStateSchema>;

/** A snapshot older than this is stale: the row shows `unknown`, never the old value. */
export const SERVICE_HEALTH_STALE_MINUTES = 10;

const money = z.object({ amount_minor: z.number().int(), currency: z.string() });

export const serviceRowSchema = z.object({
  key: z.string(),
  name: z.string(),
  group: z.enum(SERVICE_GROUPS),
  purpose: z.string(),
  switch_key: z.string().nullable(),
  /** The switch's value; null when the service has no switch. Missing config = on. */
  switch_on: z.boolean().nullable(),
  state: serviceStateSchema,
  checked_at: z.iso.datetime({ offset: true }).nullable(),
  p95_ms: z.number().nullable(),
  error_rate: z.number().nullable(),
  quota_used_pct: z.number().nullable(),
  /** Month-to-date spend; null when no source recorded any. */
  month_spend: money.nullable(),
});
export type ServiceRow = z.infer<typeof serviceRowSchema>;

export const aiTierSpendSchema = z.object({
  tier: z.string(),
  today_micros: z.number().int(),
  cap_usd: z.number().nullable(),
  enabled: z.boolean(),
});

export const aiRouteSpendSchema = z.object({
  route: z.string(),
  tier: z.string().nullable(),
  calls_today: z.number().int(),
  today_micros: z.number().int(),
  switch_key: z.string(),
  enabled: z.boolean(),
});

export const servicesResponseSchema = z.object({
  month_spend_micros: z.number().int(),
  month_budget_usd: z.number().nullable(),
  ai_today_micros: z.number().int(),
  ai_cap_usd: z.number().nullable(),
  tiers: z.array(aiTierSpendSchema),
  /** The last 14 days of AI spend, oldest first, per tier. */
  ai_days: z.array(z.object({ day: z.string(), by_tier: z.record(z.string(), z.number().int()) })),
  routes: z.array(aiRouteSpendSchema),
  services: z.array(serviceRowSchema),
});
export type ServicesResponse = z.infer<typeof servicesResponseSchema>;

/** `set_vendor_cost` (owner): a fixed plan's monthly cost, booked on the month's first day. */
export const setVendorCostPayloadSchema = z.object({
  service: z
    .string()
    .refine((key) => SERVICES.some((entry) => entry.key === key), 'unknown service'),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM'),
  amount_minor: z.number().int().min(0).max(100_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  note: z.string().trim().max(280).nullish(),
});

/** The state a row shows: a stale or missing snapshot is `unknown`. */
export function serviceStateAt(
  snapshot: { readonly state: ServiceState; readonly at: Date } | null,
  now: Date,
): ServiceState {
  if (snapshot === null) return 'unknown';
  const ageMinutes = (now.getTime() - snapshot.at.getTime()) / 60_000;
  return ageMinutes > SERVICE_HEALTH_STALE_MINUTES ? 'unknown' : snapshot.state;
}

/** `GET /v1/admin/home`: activity summaries, the services strip and AI spend today. */
export const adminHomeSchema = z.object({
  activity: z.array(
    z.object({
      id: z.uuid(),
      operator: z.string().nullable(),
      action: z.string(),
      target_kind: z.string(),
      summary: z.string(),
      at: z.iso.datetime({ offset: true }),
    }),
  ),
  services: z.object({
    total: z.number().int(),
    ok: z.number().int(),
    attention: z.array(z.object({ name: z.string(), state: serviceStateSchema })),
    unknown: z.number().int(),
  }),
  ai_today_micros: z.number().int(),
  ai_cap_usd: z.number().nullable(),
});
export type AdminHome = z.infer<typeof adminHomeSchema>;
