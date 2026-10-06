/**
 * Planning config keys (`ops.ops_config`, docs/api-contracts-planning.md, config): the retired
 * plan and places switch (pinned on for installed builds), what the trip's PLAN tile opens, the plan
 * check's limits and thresholds, the walking limit, the silent fair-use caps of the planning
 * model calls, and the link platforms the import reads. Public keys sync to the app through
 * `client_config`. Each key's default is seeded by the migration that adds the planning tables.
 */
import { z } from 'zod';

import type { ConfigKeyDefinition } from '../admin/config-keys';
import { importPlatformSchema } from './imports';

export const PLAN_HUBS = ['map', 'day'] as const;
export const planHubSchema = z.enum(PLAN_HUBS);
export type PlanHub = z.infer<typeof planHubSchema>;

export const planCheckThresholdsSchema = z.strictObject({
  too_far_day_min: z
    .number()
    .int()
    .min(30)
    .max(24 * 60),
  too_far_leg_min: z
    .number()
    .int()
    .min(10)
    .max(24 * 60),
  rain_pct: z.number().int().min(1).max(100),
  normal_rain_pct: z.number().int().min(1).max(100),
  busy_level: z.number().int().min(1).max(100),
  pace_stops_per_9h: z.number().int().min(1).max(30),
});
export type PlanCheckThresholds = z.infer<typeof planCheckThresholdsSchema>;

export const PLANNING_CONFIG_DEFAULTS = {
  'planning.redesign': true,
  'planner.typed_places': false,
  'plan.hub': 'map',
  'plan.check.max_runs_per_trip_day': 96,
  'plan.check.thresholds': {
    too_far_day_min: 180,
    too_far_leg_min: 90,
    rain_pct: 50,
    normal_rain_pct: 40,
    busy_level: 70,
    pace_stops_per_9h: 6,
  },
  'routing.walk_max_m': 1200,
  'fair_use.search_parse_per_day': 100,
  'fair_use.link_import_per_day': 30,
  'fair_use.place_compromise_per_day': 20,
  'imports.platforms': ['tiktok', 'youtube', 'instagram', 'apple_maps', 'google_maps'],
} as const satisfies Record<string, unknown>;
export type PlanningConfigKey = keyof typeof PLANNING_CONFIG_DEFAULTS;

/** The silent fair-use metrics the planning model calls count against (`fair_use_counters`). */
export const PLANNING_FAIR_USE_METRICS = [
  'search_parse',
  'link_import',
  'place_compromise',
] as const;

const cap = (max: number) => z.number().int().min(0).max(max);

export const PLANNING_CONFIG_KEYS: Readonly<Record<PlanningConfigKey, ConfigKeyDefinition>> = {
  // Not deleted: a build that still has the switch reads a missing key as off and would show the
  // earlier screens, and there is no minimum app version to wait for.
  'planning.redesign': {
    group: 'limits',
    schema: z.literal(true),
    isPublic: true,
    critical: true,
    description:
      'Retired: the redesigned plan and places screens are the only ones. Stays on for installed builds that still read it',
  },
  'planner.typed_places': {
    group: 'limits',
    schema: z.boolean(),
    isPublic: false,
    critical: true,
    description:
      "Plan drafts from places' typed facts (profile best times, visit length, meal role, dish); off reads the editors' notes",
  },
  'plan.hub': {
    group: 'limits',
    schema: planHubSchema,
    isPublic: true,
    critical: false,
    description: "What the trip's PLAN tile opens: the trip map (map) or the day plan (day)",
  },
  'plan.check.max_runs_per_trip_day': {
    group: 'limits',
    schema: cap(1000),
    isPublic: false,
    critical: false,
    description: 'Plan check runs per trip per day; later changes wait for the daily recheck',
  },
  'plan.check.thresholds': {
    group: 'limits',
    schema: planCheckThresholdsSchema,
    isPublic: false,
    critical: false,
    description: 'When the plan check calls a day too far, rainy, busy or packed',
  },
  'routing.walk_max_m': {
    group: 'limits',
    schema: z.number().int().min(100).max(10_000),
    isPublic: false,
    critical: false,
    description: 'Longest leg in metres the plan suggests walking rather than driving',
  },
  'fair_use.search_parse_per_day': {
    group: 'fair_use',
    schema: cap(100_000),
    isPublic: false,
    critical: false,
    description: 'Silent fair-use cap: plain-words searches per user per day',
  },
  'fair_use.link_import_per_day': {
    group: 'fair_use',
    schema: cap(100_000),
    isPublic: false,
    critical: false,
    description: 'Silent fair-use cap: link and screenshot imports per user per day',
  },
  'fair_use.place_compromise_per_day': {
    group: 'fair_use',
    schema: cap(100_000),
    isPublic: false,
    critical: false,
    description: 'Silent fair-use cap: compromise options for a split crew per user per day',
  },
  'imports.platforms': {
    group: 'suppliers',
    schema: z.array(importPlatformSchema).max(10),
    isPublic: true,
    critical: false,
    description: 'Link platforms Add from a link reads; others ask for a screenshot',
  },
};
