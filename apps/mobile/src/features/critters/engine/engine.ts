/**
 * The device's encounter engine: feeds location fixes into the domain reducer for the nearest
 * spawn the traveller is at, keeps the dwell as samples (distance band, accuracy, speed; never a
 * fix), and queues the commands in order: `start_encounter` once the ring starts filling,
 * `report_encounter_samples` in batches, `end_encounter` when it wanders off or is abandoned, and
 * `befriend_critter` with the signed evidence when the hold (or the accessible Befriend) completes
 * while ready. Commands wait in the offline queue, so it all works with no signal; the server
 * verifies later. Time comes from `now()`, so a replayed GPX gives the same states.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command outcomes, never copy. */
import {
  distanceM,
  encounterProgress,
  initialEncounterState,
  MAX_SAMPLES_PER_REPORT,
  reduceEncounter,
  type AttestationClaim,
  type BefriendCritterPayload,
  type DistanceBand,
  type EncounterConfig,
  type EncounterEvent,
  type EncounterPhase,
  type EncounterState,
  type EndEncounterPayload,
  type EvidenceBundle,
  type ReportEncounterSamplesPayload,
  type StartEncounterPayload,
} from '@cp/domain';

import type { EngineFix } from '@/lib/location';

import { buildEvidence, toSample, toWire, type DwellSample, type EvidenceSigner } from './evidence';
import type { SpawnCandidate } from './spawn-feed';

/** Batches of samples are sent this often (and at ready, the end and befriending). */
const FLUSH_EVERY = 60;

export interface EngineCommands {
  start(payload: StartEncounterPayload): void;
  report(payload: ReportEncounterSamplesPayload): void;
  end(payload: EndEncounterPayload): void;
  befriend(payload: BefriendCritterPayload): void;
}

export interface EngineDeps {
  readonly now: () => number;
  readonly config: () => EncounterConfig;
  readonly candidates: () => readonly SpawnCandidate[];
  readonly commands: EngineCommands;
  readonly sign: EvidenceSigner;
  readonly sha256: (text: string) => Promise<string>;
  readonly uuid: () => string;
  readonly online: () => boolean;
}

export interface EngineSnapshot {
  readonly encounterId: string | null;
  readonly phase: EncounterPhase | 'none';
  readonly progress: number;
  /** The spawn in play, or the nearest one within high-accuracy reach. */
  readonly candidate: SpawnCandidate | null;
  readonly band: DistanceBand | null;
  readonly dwellS: number;
  readonly peakDwellS: number;
  readonly startedAt: number | null;
}

interface Active {
  readonly id: string;
  readonly candidate: SpawnCandidate;
  machine: EncounterState;
  samples: DwellSample[];
  sent: number;
  mock: number;
  started: boolean;
  startedAt: number;
  peak: number;
  band: DistanceBand | null;
  evidence: { bundle: EvidenceBundle; attestation: AttestationClaim } | null;
}

const EMPTY: EngineSnapshot = {
  encounterId: null,
  phase: 'none',
  progress: 0,
  candidate: null,
  band: null,
  dwellS: 0,
  peakDwellS: 0,
  startedAt: null,
};

const iso = (ms: number) => new Date(ms).toISOString();

export function createEncounterEngine(deps: EngineDeps) {
  let active: Active | null = null;
  let nearby: SpawnCandidate | null = null;
  let snapshot: EngineSnapshot = EMPTY;
  const listeners = new Set<() => void>();

  function publish() {
    snapshot =
      active === null
        ? { ...EMPTY, candidate: nearby }
        : {
            encounterId: active.id,
            phase: active.machine.phase,
            progress: encounterProgress(active.machine),
            candidate: active.candidate,
            band: active.band,
            dwellS: active.machine.dwell_s,
            peakDwellS: active.peak,
            startedAt: active.startedAt,
          };
    for (const listener of listeners) listener();
  }

  function flush(a: Active) {
    if (!a.started) return;
    while (a.sent < a.samples.length) {
      const batch = a.samples.slice(a.sent, a.sent + MAX_SAMPLES_PER_REPORT);
      deps.commands.report({ encounter_id: a.id, samples: batch.map(toWire), mock_flags: a.mock });
      a.sent += batch.length;
    }
  }

  function step(a: Active, event: EncounterEvent) {
    const before = a.machine.phase;
    a.machine = reduceEncounter(a.machine, event, deps.config());
    a.peak = Math.max(a.peak, a.machine.dwell_s);
    const phase = a.machine.phase;
    if (!a.started && phase !== 'idle') {
      a.started = true;
      a.startedAt = event.at_ms;
      deps.commands.start({
        encounter_id: a.id,
        trip_id: a.candidate.tripId,
        spawn_rule_id: a.candidate.rule.id,
        poi_id: a.candidate.spot.poiId,
        started_at: iso(event.at_ms),
        offline: !deps.online(),
      });
    }
    if (a.samples.length - a.sent >= FLUSH_EVERY || (phase === 'ready' && before !== 'ready')) {
      flush(a);
    }
    if (phase === 'wandered_off' && before !== 'wandered_off') {
      flush(a);
      deps.commands.end({
        encounter_id: a.id,
        outcome: 'wandered_off',
        ended_at: iso(event.at_ms),
        dwell_s: Math.round(a.peak),
      });
    }
  }

  function nearest(fix: EngineFix): { c: SpawnCandidate; d: number } | null {
    let best: { c: SpawnCandidate; d: number } | null = null;
    for (const c of deps.candidates()) {
      const d = distanceM(fix, c.spot);
      if (best === null || d < best.d) best = { c, d };
    }
    return best;
  }

  return {
    onFix(fix: EngineFix): void {
      const config = deps.config();
      if (active === null) {
        const hit = nearest(fix);
        nearby = hit !== null && hit.d <= config.high_accuracy_within_m ? hit.c : null;
        const radius = hit?.c.spot.radiusM ?? config.radius_m;
        if (hit === null || hit.d > radius || fix.acc > config.accuracy_gate_m) {
          publish();
          return;
        }
        active = {
          id: deps.uuid(),
          candidate: hit.c,
          machine: initialEncounterState({ dwell_target_s: hit.c.rule.dwell_s, radius_m: radius }),
          samples: [],
          sent: 0,
          mock: 0,
          started: false,
          startedAt: fix.at,
          peak: 0,
          band: null,
          evidence: null,
        };
      }
      const a = active;
      if (a.machine.phase === 'befriended' || a.machine.phase === 'wandered_off') return;
      const d = distanceM(fix, a.candidate.spot);
      const sample = toSample({
        at: fix.at,
        distanceM: d,
        accuracyM: fix.acc,
        speedMps: fix.speed,
      });
      a.samples.push(sample);
      a.band = sample.band;
      a.mock |= fix.mock;
      step(a, { type: 'fix', at_ms: fix.at, distance_m: d, accuracy_m: fix.acc });
      publish();
    },

    /** Moves the ring on between fixes (the drain after the grace period). */
    tick(): void {
      if (active === null || !active.started) return;
      step(active, { type: 'tick', at_ms: deps.now() });
      publish();
    },

    /** Completes the encounter when ready: the hold ceremony or the accessible action. */
    async befriend(via: 'hold' | 'accessible'): Promise<boolean> {
      const a = active;
      if (a === null || a.machine.phase !== 'ready') return false;
      const at = deps.now();
      step(a, { type: 'hold', at_ms: at });
      if ((a.machine.phase as EncounterPhase) !== 'befriended') return false;
      flush(a);
      publish();
      const bundle = await buildEvidence({
        samples: a.samples,
        mockFlags: a.mock,
        insideS: a.machine.dwell_s,
        deviceNow: new Date(at),
        sha256: deps.sha256,
      });
      const attestation = await deps.sign(a.id, bundle);
      a.evidence = { bundle, attestation };
      deps.commands.befriend({
        encounter_id: a.id,
        ready_at: iso(a.machine.ready_at_ms ?? at),
        befriended_at: iso(at),
        via,
        evidence_bundle: bundle,
        attestation,
      });
      return true;
    },

    /** Leaves an encounter still under way (a new one elsewhere, or the traveller closed it). */
    abandon(): void {
      const a = active;
      if (a === null) return;
      const phase = a.machine.phase;
      if (a.started && phase !== 'befriended' && phase !== 'wandered_off') {
        flush(a);
        deps.commands.end({
          encounter_id: a.id,
          outcome: 'abandoned',
          ended_at: iso(deps.now()),
          dwell_s: Math.round(a.peak),
        });
      }
      active = null;
      publish();
    },

    /** Clears a finished encounter once its result has been shown. */
    dismiss(): void {
      const phase = active?.machine.phase;
      if (phase === 'befriended' || phase === 'wandered_off') {
        active = null;
        publish();
      }
    },

    snapshot: (): EngineSnapshot => snapshot,

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type EncounterEngine = ReturnType<typeof createEncounterEngine>;
