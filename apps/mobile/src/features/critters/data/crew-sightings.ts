/**
 * Crewmates' finds heard on the `crew_collection` channel this session, by critter: the only way
 * the app learns who else has a critter (the synced rows carry counts, never anyone's entries).
 * Kept in memory; a crewmate hiding their collection never sends one.
 */
import { useSyncExternalStore } from 'react';

const byCritter = new Map<string, readonly string[]>();
const listeners = new Set<() => void>();
let version = 0;

export function recordSighting(critterId: string, member: string): void {
  const names = byCritter.get(critterId) ?? [];
  if (member === '' || names.includes(member)) return;
  byCritter.set(critterId, [...names, member]);
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Crewmates known to have found `critterId`, in the order they were heard. */
export function useCrewSightings(critterId: string): readonly string[] {
  useSyncExternalStore(subscribe, () => version);
  return byCritter.get(critterId) ?? [];
}
