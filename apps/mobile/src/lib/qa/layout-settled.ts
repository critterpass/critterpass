import type { QaLine } from './layout-rects';

/**
 * Whether the focused screens were measured since the last layout or navigation: the layout scan
 * (./layout-scan) sets it, the settled marker (./settled-marker) shows it to a Maestro flow.
 */
let settled = false;
const listeners = new Set<() => void>();

export function setSettled(next: boolean): void {
  if (settled === next) return;
  settled = next;
  for (const listener of listeners) listener();
}

/** True once the screens shown have been measured, until the next layout or navigation. */
export function isLayoutSettled(): boolean {
  return settled;
}

/** Calls `listener` each time the settled state flips; returns the unsubscribe. */
export function subscribeLayoutSettled(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let entering = 0;

/**
 * Holds the layout scan while a screen is still on its way in: a push the native stack hasn't
 * shown yet (it waits for the page under it to finish its own work) is laid out but not yet in the
 * window, so a scroll view's system inset under the bar isn't applied. Returns the release.
 */
export function holdForEntrance(): () => void {
  entering += 1;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    entering -= 1;
  };
}

/** True while a screen is still on its way in (`holdForEntrance`). */
export function entranceHeld(): boolean {
  return entering > 0;
}

/** Back to not settled (tests). */
export function resetLayoutSettled(): void {
  settled = false;
  entering = 0;
}

/** The same lines within a point: a text laid out again did not move or change its shape. */
export function sameLines(a: readonly QaLine[], b: readonly QaLine[]): boolean {
  return (
    a.length === b.length &&
    a.every((line, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        Math.abs(line.x - other.x) <= 1 &&
        Math.abs(line.y - other.y) <= 1 &&
        Math.abs(line.width - other.width) <= 1 &&
        Math.abs(line.height - other.height) <= 1
      );
    })
  );
}
