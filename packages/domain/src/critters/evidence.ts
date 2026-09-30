/**
 * Encounter evidence (C25: never raw fixes) and its server-side plausibility score. The device
 * aggregates its dwell (sample count, mean accuracy, top speed, duration), hashes its per-sample
 * rows, records mock flags and its own clock, and signs `evidenceSigningPayload(bundle)` with its
 * attested device key at capture (App Attest `generateAssertion` on iOS; no network needed). The
 * worker re-derives the same payload, checks the signature against the key registered at install,
 * and scores: hard signals revoke, soft signals only flag for ops review.
 */
import { z } from 'zod';

import { MOCK_FLAG_ACCESSORY, MOCK_FLAGS_MAX, rejectsEvidence } from '../location/plausibility';
import type { VerifyConfig } from './config';

export const DISTANCE_BANDS = ['0_10', '10_25', '25_50', '50_plus'] as const;
export const distanceBandSchema = z.enum(DISTANCE_BANDS);
export type DistanceBand = z.infer<typeof distanceBandSchema>;

/** The band a distance falls in; the only distance a sample keeps. */
export function distanceBand(distanceM: number): DistanceBand {
  if (distanceM <= 10) return '0_10';
  if (distanceM <= 25) return '10_25';
  if (distanceM <= 50) return '25_50';
  return '50_plus';
}

export const encounterSampleSchema = z.object({
  at: z.iso.datetime({ offset: true }),
  distance_band: distanceBandSchema,
  accuracy_m: z.number().min(0).max(10_000),
  speed_mps: z.number().min(0).max(1000),
});
export type EncounterSample = z.infer<typeof encounterSampleSchema>;

const mockFlagsSchema = z.number().int().min(0).max(MOCK_FLAGS_MAX);

export const evidenceBundleSchema = z.object({
  /** sha256 (hex) over the encounter's sample rows, in order. */
  samples_hash: z.string().regex(/^[0-9a-f]{64}$/u),
  dwell: z.object({
    count: z.number().int().min(0).max(100_000),
    mean_accuracy_m: z.number().min(0).max(10_000),
    max_speed_mps: z.number().min(0).max(1000),
    duration_s: z
      .number()
      .min(0)
      .max(7 * 86_400),
    /** Seconds of dwell that filled the ring. */
    inside_s: z
      .number()
      .min(0)
      .max(7 * 86_400),
  }),
  mock_flags: mockFlagsSchema,
  /** Device clock at capture; the server keeps the skew, never trusts it for ordering. */
  device_ts: z.iso.datetime({ offset: true }),
});
export type EvidenceBundle = z.infer<typeof evidenceBundleSchema>;

export const attestationClaimSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('signed'),
    kind: z.enum(['app_attest', 'android_keystore']),
    key_id: z.string().min(1).max(200),
    /** base64 assertion / signature over `evidenceSigningPayload`. */
    signature: z.string().min(1).max(8000),
    /** Android: a fresh Play Integrity token added at upload (request hash = evidence hash). */
    integrity_token: z.string().max(16_000).optional(),
  }),
  z.object({
    status: z.literal('unavailable'),
    reason: z.string().max(80).optional(),
  }),
]);
export type AttestationClaim = z.infer<typeof attestationClaimSchema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * The exact string the device signs and the server re-derives: the encounter id plus the bundle,
 * keys sorted, no whitespace. Binding the encounter id stops one signature serving two encounters.
 */
export function evidenceSigningPayload(encounterId: string, bundle: EvidenceBundle): string {
  return canonical({ encounter_id: encounterId, evidence: bundle });
}

export type SignatureCheck = 'valid' | 'invalid' | 'unavailable';

export interface EvidenceScoreInput {
  readonly bundle: EvidenceBundle;
  readonly signature: SignatureCheck;
  /** The rule's dwell target. */
  readonly dwellTargetS: number;
  /** Device clock minus server clock at upload, in seconds. */
  readonly skewS: number;
  /** Hours between capture and upload. */
  readonly uploadDelayH: number;
  /** Travel since the user's previous verified find, when there is one. */
  readonly hop: {
    readonly distance_m: number;
    readonly seconds: number;
    readonly flightBetween: boolean;
  } | null;
}

export const HARD_SIGNALS = [
  'mock_location',
  'bad_signature',
  'impossible_speed',
  'short_dwell',
  'poor_accuracy',
] as const;
export const SOFT_SIGNALS = [
  'attestation_unavailable',
  'clock_skew',
  'late_upload',
  'accessory_gps',
] as const;
export type HardSignal = (typeof HARD_SIGNALS)[number];
export type SoftSignal = (typeof SOFT_SIGNALS)[number];

export interface EvidenceScore {
  readonly verdict: 'verified' | 'revoked';
  readonly hard: readonly HardSignal[];
  readonly soft: readonly SoftSignal[];
  /** km/h of the hop from the previous verified find, when there was one. */
  readonly hop_kmh: number | null;
}

/** Revokes only on hard signals (mock flag, bad signature, impossible speed, too little dwell). */
export function scoreEvidence(input: EvidenceScoreInput, config: VerifyConfig): EvidenceScore {
  const hard: HardSignal[] = [];
  const soft: SoftSignal[] = [];
  const { bundle } = input;
  if (rejectsEvidence(bundle.mock_flags)) hard.push('mock_location');
  if ((bundle.mock_flags & MOCK_FLAG_ACCESSORY) !== 0) soft.push('accessory_gps');
  if (input.signature === 'invalid') hard.push('bad_signature');
  if (input.signature === 'unavailable') soft.push('attestation_unavailable');
  if (
    bundle.dwell.count === 0 ||
    bundle.dwell.inside_s < input.dwellTargetS * config.min_dwell_ratio
  ) {
    hard.push('short_dwell');
  }
  if (bundle.dwell.mean_accuracy_m > config.max_mean_accuracy_m) hard.push('poor_accuracy');
  let hopKmh: number | null = null;
  if (input.hop !== null) {
    hopKmh = input.hop.distance_m / 1000 / Math.max(input.hop.seconds / 3600, 1 / 3600);
    if (!input.hop.flightBetween && hopKmh > config.max_ground_speed_kmh) {
      hard.push('impossible_speed');
    }
  }
  if (Math.abs(input.skewS) > config.max_skew_s) soft.push('clock_skew');
  if (input.uploadDelayH > config.max_upload_delay_h) soft.push('late_upload');
  return { verdict: hard.length > 0 ? 'revoked' : 'verified', hard, soft, hop_kmh: hopKmh };
}
