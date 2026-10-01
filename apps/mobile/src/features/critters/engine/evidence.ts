/**
 * What an encounter keeps and sends about where the traveller was: never a fix. Each fix becomes a
 * sample of distance band, accuracy and speed; the evidence bundle aggregates them (count, mean
 * accuracy, top speed, duration, dwell that filled the ring), hashes the sample rows in order and
 * carries the mock flags and the phone's clock. The bundle is signed at capture by the attested
 * device key (iOS App Attest; no network needed), or goes out as `unavailable`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and storage keys, never copy. */
import {
  distanceBand,
  evidenceSigningPayload,
  type AttestationClaim,
  type DistanceBand,
  type EncounterSample,
  type EvidenceBundle,
} from '@cp/domain';

export interface DwellSample {
  /** Epoch ms. */
  readonly at: number;
  readonly band: DistanceBand;
  readonly accuracyM: number;
  readonly speedMps: number;
}

const round = (value: number, places: number) => {
  const f = 10 ** places;
  return Math.round(value * f) / f;
};

export function toSample(fix: {
  readonly at: number;
  readonly distanceM: number;
  readonly accuracyM: number;
  readonly speedMps: number | undefined;
}): DwellSample {
  return {
    at: fix.at,
    band: distanceBand(fix.distanceM),
    accuracyM: round(Math.max(0, fix.accuracyM), 1),
    speedMps: round(Math.max(0, fix.speedMps ?? 0), 2),
  };
}

export function toWire(sample: DwellSample): EncounterSample {
  return {
    at: new Date(sample.at).toISOString(),
    distance_band: sample.band,
    accuracy_m: sample.accuracyM,
    speed_mps: sample.speedMps,
  };
}

/** The exact text hashed for `samples_hash`: one `at|band|accuracy|speed` line per sample. */
export function samplesHashInput(samples: readonly DwellSample[]): string {
  return samples
    .map((s) => `${new Date(s.at).toISOString()}|${s.band}|${s.accuracyM}|${s.speedMps}`)
    .join('\n');
}

export async function buildEvidence(input: {
  readonly samples: readonly DwellSample[];
  readonly mockFlags: number;
  readonly insideS: number;
  readonly deviceNow: Date;
  readonly sha256: (text: string) => Promise<string>;
}): Promise<EvidenceBundle> {
  const { samples } = input;
  const count = samples.length;
  const first = samples[0]?.at ?? input.deviceNow.getTime();
  const last = samples[count - 1]?.at ?? first;
  return {
    samples_hash: await input.sha256(samplesHashInput(samples)),
    dwell: {
      count,
      mean_accuracy_m:
        count === 0 ? 0 : round(samples.reduce((sum, s) => sum + s.accuracyM, 0) / count, 1),
      max_speed_mps: samples.reduce((max, s) => Math.max(max, s.speedMps), 0),
      duration_s: Math.round((last - first) / 1000),
      inside_s: Math.round(input.insideS),
    },
    mock_flags: input.mockFlags,
    device_ts: input.deviceNow.toISOString(),
  };
}

/** Signs the evidence with the device key, or says why it can't. */
export type EvidenceSigner = (
  encounterId: string,
  bundle: EvidenceBundle,
) => Promise<AttestationClaim>;

/** The key id the attestor stored once the api accepted its attestation. */
export const ATTESTED_KEY_ID_KEY = 'cp.attest.key_id';

export interface SignerDeps {
  readonly platform: string;
  readonly keyId: () => Promise<string | null>;
  readonly generateAssertion: (keyId: string, challenge: string) => Promise<string>;
}

/**
 * iOS: an App Attest assertion over `evidenceSigningPayload` (clientDataHash = its sha256), made
 * offline with the key attested at install. Android's Keystore key isn't registered with the
 * server, so Android (and any failure) sends `unavailable`, a soft signal, never a revoke.
 */
export function createEvidenceSigner(deps: SignerDeps): EvidenceSigner {
  return async (encounterId, bundle) => {
    if (deps.platform !== 'ios') return { status: 'unavailable', reason: 'keystore_unregistered' };
    try {
      const keyId = await deps.keyId();
      if (keyId === null) return { status: 'unavailable', reason: 'no_attested_key' };
      const signature = await deps.generateAssertion(
        keyId,
        evidenceSigningPayload(encounterId, bundle),
      );
      return { status: 'signed', kind: 'app_attest', key_id: keyId, signature };
    } catch {
      return { status: 'unavailable', reason: 'assertion_failed' };
    }
  };
}
