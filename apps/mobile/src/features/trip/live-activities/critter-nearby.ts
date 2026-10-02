/**
 * The critter-nearby Live Activity, started by the app itself while it is in front: once an
 * encounter's ring starts filling, the lock screen keeps counting the stay (ring in ten steps,
 * silhouette sharpening, minutes left), drains when the traveller wanders off, and ends on the
 * catch or when the critter is gone. The frames come from the encounter engine's own snapshot, so
 * the lock screen and the encounter scene never disagree; they carry a distance band and a place
 * name, never a position.
 *
 * iOS refuses to start an activity from the background, so a refused start is simply tried again
 * on the next change; updates and the end work while the app runs in the background. A build
 * whose widget extension has no view for this kind never starts one.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: wire values, never copy. */
import {
  buildCritterLaAttributes,
  buildCritterLaState,
  LA_KIND_SPECS,
  type CritterLaInput,
} from '@cp/domain';

const KIND = 'critter_nearby';
/** A found critter stays on the lock screen this long; a lost one goes sooner. */
export const CRITTER_FOUND_LINGER_S = 5 * 60;
export const CRITTER_GONE_LINGER_S = 60;

/** What the driver reads of the encounter engine's snapshot (features/critters/engine). */
export interface NearbySnapshot {
  readonly phase: string;
  /** Ring fill, 0–1. */
  readonly progress: number;
  readonly band: string | null;
  readonly candidate: {
    readonly rule: { readonly id: string; readonly form_id: string; readonly dwell_s: number };
    readonly spot: { readonly name: string };
  } | null;
}

export interface NearbySource {
  snapshot(): NearbySnapshot;
  subscribe(listener: () => void): () => void;
}

/** The part of the Live Activity module the driver uses (modules/cp-live-activity). */
export interface NearbyPort {
  authorization(): { readonly enabled: boolean };
  drawnKinds(): readonly string[] | null;
  start(request: {
    readonly kind: typeof KIND;
    readonly attributes: Readonly<Record<string, unknown>>;
    readonly state: Readonly<Record<string, unknown>>;
    readonly staleDate?: number;
    readonly relevance?: number;
  }): Promise<string>;
  update(request: {
    readonly kind: typeof KIND;
    readonly id: string;
    readonly state: Readonly<Record<string, unknown>>;
    readonly staleDate?: number;
    readonly relevance?: number;
  }): Promise<void>;
  end(request: {
    readonly kind: typeof KIND;
    readonly id: string;
    readonly state?: Readonly<Record<string, unknown>>;
    readonly dismissAt?: number;
  }): Promise<void>;
}

const STATES: Readonly<Record<string, CritterLaInput['state']>> = {
  accruing: 'dwelling',
  ready: 'dwelling',
  draining: 'draining',
  befriended: 'caught',
  wandered_off: 'expired',
};

function bandOf(band: string | null): CritterLaInput['distanceBand'] {
  if (band === '0_10') return 'here';
  return band === '10_25' ? 'close' : 'near';
}

/** The activity's content for an engine snapshot, or null when there is nothing to show. */
export function critterNearbyInput(snapshot: NearbySnapshot): CritterLaInput | null {
  const state = STATES[snapshot.phase];
  const candidate = snapshot.candidate;
  if (state === undefined || candidate === null) return null;
  return {
    spawnId: candidate.rule.id,
    silhouetteKey: candidate.rule.form_id,
    placeName: candidate.spot.name,
    dwellTargetS: candidate.rule.dwell_s,
    state,
    distanceBand: bandOf(snapshot.band),
    dwellFraction: snapshot.phase === 'ready' ? 1 : snapshot.progress,
    foundKey: state === 'caught' ? candidate.rule.form_id : null,
  };
}

export interface CritterNearbyDeps {
  readonly source: NearbySource;
  readonly port: NearbyPort;
  /** Unix milliseconds. */
  readonly now?: () => number;
}

/** Drives the activity from the engine until the returned stop function is called. */
export function startCritterNearbyActivity(deps: CritterNearbyDeps): () => void {
  const { source, port } = deps;
  const nowS = () => Math.floor((deps.now ?? Date.now)() / 1000);
  const relevance = 100 - LA_KIND_SPECS[KIND].rank * 10;
  const staleDate = () => nowS() + LA_KIND_SPECS[KIND].staleAfterMs / 1000;
  let active: { id: string; spawnId: string; frame: string } | null = null;
  let seq = 0;
  let stopped = false;
  // One step at a time: a start must have answered before the next frame decides what to do.
  let queue: Promise<void> = Promise.resolve();

  const drawn = () => port.authorization().enabled && (port.drawnKinds()?.includes(KIND) ?? false);

  async function finish(final: Readonly<Record<string, unknown>> | null, lingerS: number) {
    if (active === null) return;
    const { id } = active;
    active = null;
    await port
      .end({
        kind: KIND,
        id,
        ...(final === null ? {} : { state: final }),
        dismissAt: nowS() + lingerS,
      })
      .catch(() => undefined);
  }

  async function step(): Promise<void> {
    const input = stopped ? null : critterNearbyInput(source.snapshot());
    if (active !== null && (input === null || input.spawnId !== active.spawnId)) {
      await finish(null, 0);
    }
    if (input === null) return;
    const over = input.state === 'caught' || input.state === 'expired';
    // The frame without its version: the engine ticks every second, the ring moves far less often.
    const frame = JSON.stringify(buildCritterLaState(input, 0));
    if (active === null) {
      if (over || !drawn()) return;
      seq = 1;
      try {
        const id = await port.start({
          kind: KIND,
          attributes: buildCritterLaAttributes(input),
          state: buildCritterLaState(input, seq),
          staleDate: staleDate(),
          relevance,
        });
        active = { id, spawnId: input.spawnId, frame };
      } catch {
        // Refused (the app is in the background, or activities were just switched off).
      }
      return;
    }
    if (frame === active.frame) return;
    seq += 1;
    const state = buildCritterLaState(input, seq);
    if (over) {
      await finish(
        state,
        input.state === 'caught' ? CRITTER_FOUND_LINGER_S : CRITTER_GONE_LINGER_S,
      );
      return;
    }
    active.frame = frame;
    await port
      .update({ kind: KIND, id: active.id, state, staleDate: staleDate(), relevance })
      .catch(() => undefined);
  }

  const run = () => {
    queue = queue.then(step, step);
  };
  const unsubscribe = source.subscribe(run);
  run();
  return () => {
    unsubscribe();
    stopped = true;
    run();
  };
}
