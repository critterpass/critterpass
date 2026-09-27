/**
 * The analytics consent gate (docs/data-model.md `consents`, purpose `analytics`). Opt-in is the
 * only way events leave the device: before a decision they are dropped (never queued), a grant
 * opts PostHog in, and a revocation opts it out. The decision comes from the synced local
 * `consents` row (stream `me`) and from `setConsent` when the onboarding or settings screen
 * records one, whichever is newer.
 */
export type ConsentDecision = 'undecided' | 'granted' | 'denied';

export const ANALYTICS_CONSENT_PURPOSE = 'analytics';

/** The synced `consents` columns the gate reads. */
export interface ConsentRow {
  readonly purpose: string;
  readonly granted_at: string | null;
  readonly revoked_at: string | null;
  readonly updated_at: string;
}

/** The latest analytics row decides; no row means the user has not been asked yet. */
export function decisionFromRows(rows: readonly ConsentRow[]): ConsentDecision {
  const latest = rows
    .filter((row) => row.purpose === ANALYTICS_CONSENT_PURPOSE)
    .reduce<ConsentRow | undefined>(
      (best, row) => (best === undefined || row.updated_at > best.updated_at ? row : best),
      undefined,
    );
  if (latest === undefined) return 'undecided';
  return latest.granted_at !== null && latest.revoked_at === null ? 'granted' : 'denied';
}

type Listener = (decision: ConsentDecision) => void;

export interface ConsentGate {
  readonly decision: () => ConsentDecision;
  readonly set: (decision: ConsentDecision) => void;
  readonly subscribe: (listener: Listener) => () => void;
}

export function createConsentGate(initial: ConsentDecision = 'undecided'): ConsentGate {
  let current = initial;
  const listeners = new Set<Listener>();
  return {
    decision: () => current,
    set(decision) {
      if (decision === current) return;
      current = decision;
      for (const listener of listeners) listener(decision);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
