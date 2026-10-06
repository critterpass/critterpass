/**
 * Every outside service CritterPass calls, for the console's Services & spend screen. A static
 * list, not a table: adding a vendor is one entry. `health` says where its state comes from
 * (`probe`: a free status endpoint; `metrics`: our own call counters; `none`: nothing measured, so
 * it always shows `unknown`). `switch_key` names the kill switch that turns our use of it off.
 */
import { z } from 'zod';

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
}

export const SERVICES: readonly ServiceEntry[] = [
  {
    key: 'deepseek',
    name: 'DeepSeek',
    group: 'ai',
    purpose: 'Guide chat, drafts, profiles (fast and pro tiers)',
    health: 'metrics',
    switch_key: 'ai.tier.fast.enabled',
  },
  {
    key: 'jev',
    name: 'TypeSafe (Jev)',
    group: 'ai',
    purpose: 'Structured answers and decisions',
    health: 'metrics',
  },
  {
    key: 'gemini',
    name: 'Gemini',
    group: 'ai',
    purpose: 'Fallback tier and link vision',
    health: 'metrics',
    switch_key: 'ai.tier.gemini.enabled',
  },
  {
    key: 'tavily',
    name: 'Tavily web search',
    group: 'ai',
    purpose: 'Web pages for place profiles and estimates',
    health: 'metrics',
  },
  {
    key: 'prelude',
    name: 'Prelude',
    group: 'messaging',
    purpose: 'SMS sign-in codes',
    health: 'metrics',
    switch_key: 'otp.prelude.enabled',
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp Business',
    group: 'messaging',
    purpose: 'Sign-in codes, vendor desk',
    health: 'metrics',
    switch_key: 'otp.whatsapp.enabled',
  },
  {
    key: 'telegram',
    name: 'Telegram',
    group: 'messaging',
    purpose: 'Sign-in codes',
    health: 'metrics',
    switch_key: 'otp.telegram.enabled',
  },
  {
    key: 'apns',
    name: 'APNs',
    group: 'push',
    purpose: 'Push, Live Activities, widgets',
    health: 'metrics',
    switch_key: 'widgets.push.enabled',
  },
  { key: 'fcm', name: 'FCM', group: 'push', purpose: 'Android push', health: 'metrics' },
  {
    key: 'revenuecat',
    name: 'RevenueCat',
    group: 'payments',
    purpose: 'Purchases and store webhooks',
    health: 'probe',
    switch_key: 'billing.enabled',
  },
  {
    key: 'mapbox',
    name: 'Mapbox',
    group: 'maps_travel',
    purpose: 'Routes and ETAs',
    health: 'metrics',
  },
  {
    key: 'weatherapi',
    name: 'WeatherAPI.com',
    group: 'maps_travel',
    purpose: 'Forecasts and marine',
    health: 'metrics',
  },
  {
    key: 'foursquare',
    name: 'Foursquare Places',
    group: 'maps_travel',
    purpose: 'Place data and live hours',
    health: 'metrics',
  },
  {
    key: 'frankfurter',
    name: 'Frankfurter',
    group: 'maps_travel',
    purpose: 'Currency rates',
    health: 'metrics',
  },
  {
    key: 'travelpayouts',
    name: 'Travelpayouts',
    group: 'maps_travel',
    purpose: 'Fares and stay links',
    health: 'metrics',
  },
  {
    key: 'viator',
    name: 'Viator',
    group: 'suppliers',
    purpose: 'Tours, booked in the app',
    health: 'metrics',
  },
  {
    key: 'grab',
    name: 'Grab',
    group: 'suppliers',
    purpose: 'Ride price estimates',
    health: 'metrics',
  },
  {
    key: 'resend',
    name: 'Resend',
    group: 'mail_print',
    purpose: 'Support replies, receipts',
    health: 'probe',
  },
  {
    key: 'postgrid',
    name: 'PostGrid',
    group: 'mail_print',
    purpose: 'Printed postcards',
    health: 'metrics',
    switch_key: 'postcards.enabled',
  },
  {
    key: 'railway',
    name: 'Railway',
    group: 'infrastructure',
    purpose: 'api, worker, realtime, sync',
    health: 'probe',
  },
  {
    key: 'planetscale',
    name: 'PlanetScale Postgres',
    group: 'infrastructure',
    purpose: 'Primary database',
    health: 'probe',
  },
  {
    key: 'cloudflare',
    name: 'Cloudflare',
    group: 'infrastructure',
    purpose: 'Workers, R2 media, tiles',
    health: 'probe',
  },
  {
    key: 'observability',
    name: 'Sentry · PostHog · Grafana · Langfuse',
    group: 'infrastructure',
    purpose: 'Errors, analytics, metrics, AI traces',
    health: 'none',
  },
];

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
