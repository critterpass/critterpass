/**
 * Critter command payloads (docs/api-contracts-critters.md). No payload carries a coordinate: the
 * device evaluates spawns on its own, and the server sees places (POI ids), times, distance bands
 * and aggregates only.
 */
import { z } from 'zod';

import { uuidV7Schema } from '../ids';
import { attestationClaimSchema, encounterSampleSchema, evidenceBundleSchema } from './evidence';

const isoTs = z.iso.datetime({ offset: true });

export const HATCH_TRIGGERS = ['landed', 'arrived', 'manual'] as const;
export const hatchTriggerSchema = z.enum(HATCH_TRIGGERS);
export type HatchTrigger = z.infer<typeof hatchTriggerSchema>;

/** System: one egg per (user, trip) when a traveller boards. */
export const grantEggPayloadSchema = z.object({ trip_id: z.uuid(), user_id: z.uuid() });
export type GrantEggPayload = z.infer<typeof grantEggPayloadSchema>;

/** Device arrival geofence (`arrived`) or the manual "Hatch it" button; `landed` is the server's. */
export const hatchEggPayloadSchema = z.object({
  trip_id: z.uuid(),
  trigger: z.enum(['arrived', 'manual']),
});
export type HatchEggPayload = z.infer<typeof hatchEggPayloadSchema>;

export const startEncounterPayloadSchema = z.object({
  /** Client UUIDv7, so an offline start and its later samples and befriend agree on the row. */
  encounter_id: uuidV7Schema,
  /** Null only in the home set, with Explore at home on. */
  trip_id: z.uuid().nullable(),
  spawn_rule_id: z.uuid(),
  /** The spot: one of the rule's POIs, or null for a geofence-only spawn. */
  poi_id: z.uuid().nullable(),
  started_at: isoTs,
  offline: z.boolean(),
});
export type StartEncounterPayload = z.infer<typeof startEncounterPayloadSchema>;

export const MAX_SAMPLES_PER_REPORT = 500;

export const reportEncounterSamplesPayloadSchema = z.object({
  encounter_id: z.uuid(),
  samples: z.array(encounterSampleSchema).min(1).max(MAX_SAMPLES_PER_REPORT),
  mock_flags: z.number().int().min(0).max(7),
});
export type ReportEncounterSamplesPayload = z.infer<typeof reportEncounterSamplesPayloadSchema>;

export const endEncounterPayloadSchema = z.object({
  encounter_id: z.uuid(),
  outcome: z.enum(['wandered_off', 'abandoned']),
  ended_at: isoTs,
  /** Dwell the ring held at its peak, for the wandered-off card. */
  dwell_s: z
    .number()
    .min(0)
    .max(7 * 86_400),
});
export type EndEncounterPayload = z.infer<typeof endEncounterPayloadSchema>;

export const befriendCritterPayloadSchema = z.object({
  encounter_id: z.uuid(),
  ready_at: isoTs,
  befriended_at: isoTs,
  /** How it was completed: the hold ceremony or the accessible Befriend action. */
  via: z.enum(['hold', 'accessible']),
  evidence_bundle: evidenceBundleSchema,
  attestation: attestationClaimSchema,
});
export type BefriendCritterPayload = z.infer<typeof befriendCritterPayloadSchema>;

/** `form_id: null` reverts the guide to its canonical look. */
export const setGuideSkinPayloadSchema = z.object({
  guide_id: z.uuid(),
  form_id: z.uuid().nullable(),
});
export type SetGuideSkinPayload = z.infer<typeof setGuideSkinPayloadSchema>;

export const setExploreAtHomePayloadSchema = z.object({ on: z.boolean() });
export type SetExploreAtHomePayload = z.infer<typeof setExploreAtHomePayloadSchema>;

export const setLegendaryReminderPayloadSchema = z.object({
  window_id: z.uuid(),
  on: z.boolean(),
});
export type SetLegendaryReminderPayload = z.infer<typeof setLegendaryReminderPayloadSchema>;

export const ENCOUNTER_STATES = [
  'accruing',
  'ready',
  'befriended',
  'wandered_off',
  'abandoned',
] as const;
export type EncounterRowState = (typeof ENCOUNTER_STATES)[number];

export const VERIFICATIONS = ['pending', 'verified', 'revoked'] as const;
export type Verification = (typeof VERIFICATIONS)[number];

export const COLLECTION_SOURCES = ['hatch', 'encounter', 'quest', 'grant'] as const;
export type CollectionSource = (typeof COLLECTION_SOURCES)[number];
