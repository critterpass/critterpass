/**
 * The dwell the server can vouch for: the samples a phone reported for its encounter (a time, a
 * distance band and an accuracy; never a position) replayed through the same reducer the app's
 * engine runs. The ring only fills between samples the phone actually sent, so a silent phone never
 * earns dwell; a ring that is draining keeps draining on the server's clock.
 */
import {
  encounterProgress,
  initialEncounterState,
  reduceEncounter,
  type CritterLaInput,
  type EncounterConfig,
  type EncounterPhase,
} from '@cp/domain';

export interface DwellSample {
  readonly at: Date;
  readonly distance_band: string;
  readonly accuracy_m: number;
}

/** A sample's band as a distance: the middle of the band; `50_plus` is past any edge jitter. */
const BAND_M: Readonly<Record<string, number>> = { '0_10': 5, '10_25': 18, '25_50': 38 };
const FAR_M = 1_000_000;
/** The lock-screen ring counts a stay within 50 m of the spot. */
const RING_RADIUS_M = 50;

export interface ConfirmedDwell {
  readonly phase: EncounterPhase;
  /** Ring fill, 0–1. */
  readonly fraction: number;
  readonly band: CritterLaInput['distanceBand'];
  readonly lastSampleAt: Date | null;
}

function bandOf(band: string | undefined): CritterLaInput['distanceBand'] {
  if (band === '0_10') return 'here';
  return band === '10_25' ? 'close' : 'near';
}

export function confirmedDwell(
  samples: readonly DwellSample[],
  dwellTargetS: number,
  now: Date,
  config: EncounterConfig,
): ConfirmedDwell {
  let state = initialEncounterState({ dwell_target_s: dwellTargetS, radius_m: RING_RADIUS_M });
  for (const sample of samples) {
    state = reduceEncounter(
      state,
      {
        type: 'fix',
        at_ms: sample.at.getTime(),
        distance_m: BAND_M[sample.distance_band] ?? FAR_M,
        accuracy_m: sample.accuracy_m,
      },
      config,
    );
  }
  if (state.phase === 'draining') {
    state = reduceEncounter(state, { type: 'tick', at_ms: now.getTime() }, config);
  }
  const last = samples.at(-1);
  return {
    phase: state.phase,
    fraction: encounterProgress(state),
    band: bandOf(last?.distance_band),
    lastSampleAt: last?.at ?? null,
  };
}
