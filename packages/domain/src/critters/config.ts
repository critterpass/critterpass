/**
 * Encounter and verification constants. The defaults below are what ships; the server tunes them
 * without a release: devices read `client_config` key `encounter` (the catalog stream), the worker
 * reads `ops.ops_config` key `critters.verify`. Unknown or malformed overrides fall back to the
 * defaults field by field, so a bad config row never stops an encounter.
 */
import { z } from 'zod';

export const ENCOUNTER_CONFIG_KEY = 'encounter';
export const VERIFY_CONFIG_KEY = 'critters.verify';

export const encounterConfigSchema = z.object({
  /** Spawn radius when the rule's geofence names none. */
  radius_m: z.number().positive().max(300),
  /** A fix counts toward dwell only at this accuracy or better. */
  accuracy_gate_m: z.number().positive().max(200),
  /** Exit needs radius + max(this, accuracy): jitter at the edge never reads as leaving. */
  hysteresis_min_m: z.number().min(0).max(200),
  /** Seconds after leaving before the ring starts to drain. */
  grace_s: z.number().min(0).max(1800),
  /** Drain speed as a share of the fill speed (⅓: a full ring takes three times as long to empty). */
  drain_ratio: z.number().positive().max(10),
  /** High-accuracy location only inside this distance of an eligible spawn. */
  high_accuracy_within_m: z.number().positive().max(2000),
  /** NEAR ME filter reach around the last coarse position. */
  near_me_m: z.number().positive().max(50_000),
  /** Co-presence: members' verified dwell must overlap at least this long. */
  co_presence_overlap_s: z.number().min(1).max(3600),
});
export type EncounterConfig = z.infer<typeof encounterConfigSchema>;

export const DEFAULT_ENCOUNTER_CONFIG: EncounterConfig = {
  radius_m: 50,
  accuracy_gate_m: 35,
  hysteresis_min_m: 20,
  grace_s: 90,
  drain_ratio: 1 / 3,
  high_accuracy_within_m: 150,
  near_me_m: 5000,
  co_presence_overlap_s: 60,
};

export const verifyConfigSchema = z.object({
  /** Ground travel faster than this between two verified finds, with no flight landing between, revokes. */
  max_ground_speed_kmh: z.number().positive(),
  /** Device clock further than this from the server clock is a soft flag for ops review. */
  max_skew_s: z.number().positive(),
  /** Mean accuracy worse than this revokes: the dwell was never really inside the spawn. */
  max_mean_accuracy_m: z.number().positive(),
  /** Reported dwell below this share of the rule's dwell revokes. */
  min_dwell_ratio: z.number().min(0).max(1),
  /** Evidence older than this when it reaches the server is a soft flag. */
  max_upload_delay_h: z.number().positive(),
});
export type VerifyConfig = z.infer<typeof verifyConfigSchema>;

export const DEFAULT_VERIFY_CONFIG: VerifyConfig = {
  max_ground_speed_kmh: 350,
  max_skew_s: 600,
  max_mean_accuracy_m: 50,
  min_dwell_ratio: 0.9,
  max_upload_delay_h: 72,
};

function overlay<T extends Record<string, unknown>>(
  shape: Readonly<Record<string, z.ZodType>>,
  defaults: T,
  override: unknown,
): T {
  if (override === null || typeof override !== 'object') return defaults;
  const out: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    const field = shape[key];
    if (field === undefined) continue;
    const parsed = field.safeParse(value);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as T;
}

/** The defaults with every valid field of the server's override applied. */
export function resolveEncounterConfig(override: unknown): EncounterConfig {
  return overlay(encounterConfigSchema.shape, DEFAULT_ENCOUNTER_CONFIG, override);
}

export function resolveVerifyConfig(override: unknown): VerifyConfig {
  return overlay(verifyConfigSchema.shape, DEFAULT_VERIFY_CONFIG, override);
}
