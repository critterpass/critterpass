/**
 * Ephemeral trails: each member's last five minutes of positions, held in this screen's memory
 * only (never written to storage, never sent anywhere), drawn while they move fast and fading out
 * 30 s after they stop.
 */
import {
  appendTrailPoint,
  EMPTY_TRAIL,
  trailOpacity,
  visibleTrailPoints,
  type Trail,
} from '@cp/domain';
import { useMemo, useState } from 'react';

import type { LiveMember } from './live-state';

export interface VisibleTrail {
  readonly uid: string;
  /** `[lng, lat]` pairs, oldest first. */
  readonly coordinates: readonly (readonly [number, number])[];
  readonly opacity: number;
}

/** The members' latest fixes folded into a copy of `trails`; members gone take their trail. */
export function foldTrails(
  trails: ReadonlyMap<string, Trail>,
  members: ReadonlyMap<string, LiveMember>,
): Map<string, Trail> {
  const next = new Map<string, Trail>();
  for (const member of members.values()) {
    const trail = trails.get(member.uid) ?? EMPTY_TRAIL;
    next.set(
      member.uid,
      appendTrailPoint(trail, { lat: member.lat, lng: member.lng, at: member.at }, member.activity),
    );
  }
  return next;
}

export function visibleTrails(trails: ReadonlyMap<string, Trail>, now: number): VisibleTrail[] {
  const out: VisibleTrail[] = [];
  for (const [uid, trail] of trails) {
    const opacity = trailOpacity(trail, now);
    const points = visibleTrailPoints(trail, now);
    if (opacity <= 0 || points.length < 2) continue;
    out.push({ uid, opacity, coordinates: points.map((p) => [p.lng, p.lat] as const) });
  }
  return out;
}

export function useTrails(members: ReadonlyMap<string, LiveMember>, now: number): VisibleTrail[] {
  const [store, setStore] = useState(() => ({ members, trails: foldTrails(new Map(), members) }));
  if (store.members !== members) {
    setStore({ members, trails: foldTrails(store.trails, members) });
  }
  return useMemo(() => visibleTrails(store.trails, now), [store.trails, now]);
}
