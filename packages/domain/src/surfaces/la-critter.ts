/**
 * The critter-nearby Live Activity (5a-4): a dwell ring that fills while the member stays within
 * the spawn's radius and drains slowly when they wander off, with the silhouette sharpening as it
 * fills. The server confirms the dwell; the state carries a distance band, never a position.
 */
import { z } from 'zod';

import { laLine } from './la-common';

export const LA_CRITTER_DISTANCE_BANDS = ['near', 'close', 'here'] as const;
export const LA_CRITTER_STATES = ['dwelling', 'draining', 'caught', 'expired'] as const;
/** The ring is quantised to this many steps (payload budget, and no animation between pushes). */
export const LA_CRITTER_RING_STEPS = 10;
/** Silhouette blur stages, 3 (fully blurred) to 0 (sharp). */
export const LA_CRITTER_BLUR_STAGES = 3;

export const critterLaAttributesSchema = z.object({
  spawn_id: z.uuid(),
  /** App Group art key of the blurred silhouette (`assets/critters/<key>`). */
  silhouette_key: z.string().max(80),
  /** The place it is hiding at ("Tirta Empul"): a name, never a position. */
  place_name: z.string().max(40).nullable(),
});
export type CritterLaAttributes = z.infer<typeof critterLaAttributesSchema>;

export const critterLaStateSchema = z.object({
  seq: z.number().int().nonnegative(),
  state: z.enum(LA_CRITTER_STATES),
  distance_band: z.enum(LA_CRITTER_DISTANCE_BANDS),
  ring: z.number().int().min(0).max(LA_CRITTER_RING_STEPS),
  blur_stage: z.number().int().min(0).max(LA_CRITTER_BLUR_STAGES),
  /** Art key of the found critter, once caught. */
  found_key: z.string().max(80).nullable(),
  /** Whole minutes of staying put still to go ("STAY 4 MORE MIN"); null once it is not filling. */
  remain_min: z.number().int().nonnegative().nullable(),
});
export type CritterLaState = z.infer<typeof critterLaStateSchema>;

export interface CritterLaInput {
  readonly spawnId: string;
  readonly silhouetteKey: string;
  readonly placeName: string | null;
  /** Seconds of dwell the spawn asks for. */
  readonly dwellTargetS: number;
  readonly state: (typeof LA_CRITTER_STATES)[number];
  readonly distanceBand: (typeof LA_CRITTER_DISTANCE_BANDS)[number];
  /** Server-confirmed dwell, 0–1. */
  readonly dwellFraction: number;
  readonly foundKey: string | null;
}

export function critterRingStep(fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.floor(clamped * LA_CRITTER_RING_STEPS);
}

/** Blur 3 → 0 as the ring fills (sharp only when complete). */
export function critterBlurStage(ring: number): number {
  if (ring >= LA_CRITTER_RING_STEPS) return 0;
  return (
    LA_CRITTER_BLUR_STAGES - Math.floor((ring / LA_CRITTER_RING_STEPS) * LA_CRITTER_BLUR_STAGES)
  );
}

export function buildCritterLaAttributes(input: CritterLaInput): CritterLaAttributes {
  return {
    spawn_id: input.spawnId,
    silhouette_key: input.silhouetteKey,
    place_name: input.placeName === null ? null : laLine(input.placeName, 40),
  };
}

export function buildCritterLaState(input: CritterLaInput, seq: number): CritterLaState {
  const ring =
    input.state === 'caught' ? LA_CRITTER_RING_STEPS : critterRingStep(input.dwellFraction);
  const remaining = 1 - Math.min(1, Math.max(0, input.dwellFraction));
  const filling = input.state === 'dwelling' && remaining > 0;
  return {
    seq,
    state: input.state,
    distance_band: input.distanceBand,
    ring,
    blur_stage: critterBlurStage(ring),
    found_key: input.state === 'caught' ? input.foundKey : null,
    remain_min: filling ? Math.ceil(Math.round(remaining * input.dwellTargetS) / 60) : null,
  };
}
