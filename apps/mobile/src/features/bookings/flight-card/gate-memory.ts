/**
 * GATE CHANGE on the card: the first gate this session saw for a leg, so a later, different gate
 * (an AeroAPI gate alert synced while the app runs) reads as a change until the flight moves on.
 */
const firstSeen = new Map<string, string>();

export function gateChanged(segmentId: string, gate: string | null): boolean {
  if (gate === null || gate === '') return false;
  const seen = firstSeen.get(segmentId);
  if (seen === undefined) {
    firstSeen.set(segmentId, gate);
    return false;
  }
  return seen !== gate;
}
