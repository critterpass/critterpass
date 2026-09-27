/**
 * The link waiting for onboarding to finish. A link opened (or claimed at first launch) before the
 * pass is issued is kept here and taken once onboarding completes, then routed like a fresh open.
 * Kept 24 hours: an old invite should not ambush someone who finishes onboarding days later.
 */
import { createMMKV } from 'react-native-mmkv';

import type { AttributionVia } from '@cp/domain';

// createMMKV() returns its own in-memory store under Jest, so tests use the real module.
const storage = createMMKV({ id: 'cp-links' });

const PENDING_KEY = 'cp.links.pending';
const ONBOARDED_KEY = 'cp.links.onboarded';

export const PENDING_LINK_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingLink {
  /** Canonical link path (`/i/K7M2QX`) or custom-scheme URL, parsed again when taken. */
  readonly link: string;
  readonly capturedAt: number;
  readonly via?: AttributionVia;
}

function isPendingLink(value: unknown): value is PendingLink {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<PendingLink>;
  return typeof candidate.link === 'string' && typeof candidate.capturedAt === 'number';
}

export function savePendingLink(pending: PendingLink): void {
  storage.set(PENDING_KEY, JSON.stringify(pending));
}

export function peekPendingLink(now: number = Date.now()): PendingLink | null {
  const raw = storage.getString(PENDING_KEY);
  if (raw === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!isPendingLink(parsed) || now - parsed.capturedAt > PENDING_LINK_TTL_MS) {
    storage.remove(PENDING_KEY);
    return null;
  }
  return parsed;
}

/** Returns the pending link (if still fresh) and forgets it. */
export function takePendingLink(now: number = Date.now()): PendingLink | null {
  const pending = peekPendingLink(now);
  storage.remove(PENDING_KEY);
  return pending;
}

export function clearPendingLink(): void {
  storage.remove(PENDING_KEY);
}

/** Set by onboarding once the pass is issued; until then links wait in the pending slot. */
export function isOnboardingComplete(): boolean {
  return storage.getBoolean(ONBOARDED_KEY) === true;
}

export function setOnboardingComplete(done: boolean): void {
  storage.set(ONBOARDED_KEY, done);
}
