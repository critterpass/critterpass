/**
 * Telling "not on this phone" from "not on this phone yet": a push or a link can open a proposal
 * before it has synced, so an empty read only counts as missing once it has stayed empty for a
 * while.
 */
import { useEffect, useState } from 'react';

/** How long an empty read may still be a proposal on its way to this phone. */
export const MISSING_AFTER_MS = 8000;

/** True once `missing` has held for the whole wait; a row that arrives in time never trips it. */
export function useStillMissing(missing: boolean, afterMs: number = MISSING_AFTER_MS): boolean {
  const [gaveUp, setGaveUp] = useState(false);
  // Found after all: a later miss waits the whole time again.
  if (!missing && gaveUp) setGaveUp(false);
  useEffect(() => {
    if (!missing) return undefined;
    const timer = setTimeout(() => setGaveUp(true), afterMs);
    return () => clearTimeout(timer);
  }, [missing, afterMs]);
  return missing && gaveUp;
}
