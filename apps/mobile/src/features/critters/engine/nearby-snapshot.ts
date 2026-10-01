/**
 * The nearby snapshot the Live Activity and widgets read from the App Group
 * (`snapshot/critter-nearby.json`): which spawn is in play, its silhouette key, the distance band
 * and how sharp the silhouette is (blur stage 3 → 0 as the ring fills). Never a position. The
 * writer is the cp-app-group module, handed over by the root route; without it nothing is written.
 */
import type { EngineSnapshot } from './engine';

export type SnapshotWriter = (key: string, json: string) => void;

export const NEARBY_SNAPSHOT_KEY = 'critter-nearby';
export const NEARBY_SCHEMA_VERSION = 1;

let writer: SnapshotWriter | null = null;
let last = '';

export function setNearbyWriter(next: SnapshotWriter | null): void {
  writer = next;
}

/** 3 (a blur) → 0 (sharp) as the ring fills; 0 once ready. */
export function blurStage(progress: number): number {
  return Math.max(0, 3 - Math.floor(Math.min(1, progress) * 4));
}

export function nearbyBody(snapshot: EngineSnapshot) {
  const c = snapshot.candidate;
  if (c === null) return { active: false };
  return {
    active: true,
    spawn_id: c.rule.id,
    silhouette_key: c.rule.form_id,
    place: c.spot.name,
    phase: snapshot.phase,
    distance_band: snapshot.band,
    blur_stage: blurStage(snapshot.progress),
    progress: Math.round(snapshot.progress * 100) / 100,
  };
}

export function writeNearby(snapshot: EngineSnapshot): void {
  if (writer === null) return;
  const body = JSON.stringify(nearbyBody(snapshot));
  if (body === last) return;
  last = body;
  try {
    writer(
      NEARBY_SNAPSHOT_KEY,
      JSON.stringify({
        schema: NEARBY_SCHEMA_VERSION,
        generated_at: new Date().toISOString(),
        ...(JSON.parse(body) as object),
      }),
    );
  } catch {
    // A build without the App Group module keeps encounters working; the surfaces just stay idle.
  }
}
