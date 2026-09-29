/**
 * Pin bunching on the crew map: members within 60 m of each other whose fixes are within 2 minutes
 * merge into one pill ("MAYA + RIN · Karsa Spa"). Single-link clustering, so a chain of close
 * members is one bunch; members keep their input order inside a bunch and bunches are ordered by
 * their first member, so the same fixes always draw the same pills.
 */
import { distanceM, type LatLng } from '../location/geo';

export const BUNCH_RADIUS_M = 60;
export const BUNCH_MAX_SKEW_MS = 2 * 60_000;

export interface BunchMember extends LatLng {
  readonly uid: string;
  /** Epoch ms of the member's latest fix. */
  readonly at: number;
}

export interface Bunch<M extends BunchMember = BunchMember> {
  readonly members: readonly M[];
  /** Centroid of the members' positions. */
  readonly lat: number;
  readonly lng: number;
}

function close(a: BunchMember, b: BunchMember, radiusM: number, maxSkewMs: number): boolean {
  return Math.abs(a.at - b.at) <= maxSkewMs && distanceM(a, b) <= radiusM;
}

export function bunch<M extends BunchMember>(
  members: readonly M[],
  radiusM: number = BUNCH_RADIUS_M,
  maxSkewMs: number = BUNCH_MAX_SKEW_MS,
): Bunch<M>[] {
  const parent = members.map((_, index) => index);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] as number;
    return root;
  };
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (close(members[i] as M, members[j] as M, radiusM, maxSkewMs)) {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
  }
  const groups = new Map<number, M[]>();
  members.forEach((member, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(member);
    groups.set(root, group);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, group]) => ({
      members: group,
      lat: group.reduce((sum, m) => sum + m.lat, 0) / group.length,
      lng: group.reduce((sum, m) => sum + m.lng, 0) / group.length,
    }));
}
