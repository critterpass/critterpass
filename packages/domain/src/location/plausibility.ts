/**
 * Anti-spoof flags carried by every fix, encounter sample and visit evidence. The OS reports
 * software simulation (iOS `sourceInformation.isSimulatedBySoftware`, Android `Location.isMock()`)
 * and external accessories (`isProducedByAccessory`, a Bluetooth GPS); the app adds a speed and
 * teleport check between consecutive fixes.
 *
 * Flags ride along everywhere; only encounter and visit evidence is rejected for them, and an
 * accessory alone is never a reason (it is a real receiver). Share and SOS fixes are always
 * accepted with their flags stored: SOS is never gated.
 */
import { distanceM } from './geo';

export const MOCK_FLAG_SIMULATED = 1;
export const MOCK_FLAG_ACCESSORY = 2;
export const MOCK_FLAG_IMPLAUSIBLE = 4;
/** Every defined bit; a `mock_flags` value outside 0..MOCK_FLAGS_MAX is malformed. */
export const MOCK_FLAGS_MAX = 7;

export const MAX_PLAUSIBLE_SPEED_KMH = 250;

export type PlausibilityReason = 'simulated' | 'too_fast' | 'teleport';

export interface FixEvidence {
  readonly lat: number;
  readonly lng: number;
  readonly accuracyM: number;
  /** Epoch ms. */
  readonly at: number;
  readonly simulated: boolean;
  readonly accessory: boolean;
}

export interface PlausibilityResult {
  readonly flags: number;
  readonly reasons: readonly PlausibilityReason[];
}

/**
 * Flags for `fix` given the previous accepted fix. Distances subtract both accuracy radii, so a
 * jittery but honest pair never reads as speeding.
 */
export function checkPlausibility(
  previous: FixEvidence | null,
  fix: FixEvidence,
  maxSpeedKmh: number = MAX_PLAUSIBLE_SPEED_KMH,
): PlausibilityResult {
  const reasons: PlausibilityReason[] = [];
  let flags = 0;
  if (fix.simulated) {
    flags |= MOCK_FLAG_SIMULATED;
    reasons.push('simulated');
  }
  if (fix.accessory) flags |= MOCK_FLAG_ACCESSORY;
  if (previous !== null) {
    const slackM = Math.max(0, distanceM(previous, fix) - previous.accuracyM - fix.accuracyM);
    const dtMs = fix.at - previous.at;
    if (slackM > 0 && dtMs <= 0) {
      reasons.push('teleport');
    } else if (dtMs > 0 && (slackM / dtMs) * 3600 > maxSpeedKmh) {
      reasons.push('too_fast');
    }
    if (reasons.includes('teleport') || reasons.includes('too_fast')) {
      flags |= MOCK_FLAG_IMPLAUSIBLE;
    }
  }
  return { flags, reasons };
}

/** Encounter and visit evidence with these flags is rejected with `LOCATION_IMPLAUSIBLE`. */
export function rejectsEvidence(flags: number): boolean {
  return (flags & (MOCK_FLAG_SIMULATED | MOCK_FLAG_IMPLAUSIBLE)) !== 0;
}
