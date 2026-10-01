/**
 * The pass draft on the device: persisted after every change (MMKV) so a relaunch resumes where
 * the user left, and observable so every onboarding screen reads the same draft. The pass is
 * issued from here, locally first; the server copy follows through the command queue.
 */
/* eslint-disable lingui/no-unlocalized-strings -- storage keys, never copy. */
import { useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

import { generateUuidV7, newPassDraft, parsePassDraft, type PassDraft } from '@cp/domain';

// createMMKV() returns its own in-memory store under Jest, so tests use the real module.
const storage = createMMKV({ id: 'cp-onboarding' });

const DRAFT_KEY = 'cp.onboarding.draft';
const SYNC_KEY = 'cp.onboarding.sync';

/** Where the server copy of the pass is: nothing sent, `issue_pass` queued, or applied. */
export interface PassSyncState {
  /** `start_pass` answered: the reserved number is on the draft. */
  readonly numberReserved: boolean;
  /** `issue_pass` handed to the command queue (it replays until the server applies it). */
  readonly issueQueued: boolean;
}

const listeners = new Set<() => void>();
let cachedDraft: PassDraft | null | undefined;
let cachedSync: PassSyncState | undefined;

function notify(): void {
  listeners.forEach((listener) => listener());
}

function readJson(key: string): unknown {
  const raw = storage.getString(key);
  if (raw === undefined) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function readDraft(): PassDraft | null {
  if (cachedDraft === undefined) cachedDraft = parsePassDraft(readJson(DRAFT_KEY));
  return cachedDraft;
}

export function readPassSync(): PassSyncState {
  if (cachedSync === undefined) {
    const raw = readJson(SYNC_KEY) as Partial<PassSyncState> | null;
    cachedSync = {
      numberReserved: raw?.numberReserved === true,
      issueQueued: raw?.issueQueued === true,
    };
  }
  return cachedSync;
}

export function writeDraft(draft: PassDraft): void {
  storage.set(DRAFT_KEY, JSON.stringify(draft));
  cachedDraft = draft;
  notify();
}

/** Starts a fresh draft (or returns the one in progress). */
export function ensureDraft(): PassDraft {
  const existing = readDraft();
  if (existing !== null) return existing;
  const draft = newPassDraft(generateUuidV7());
  writeDraft(draft);
  return draft;
}

export function updateDraft(change: (draft: PassDraft) => PassDraft): PassDraft {
  const next = change(ensureDraft());
  writeDraft(next);
  return next;
}

export function updatePassSync(change: Partial<PassSyncState>): void {
  const next = { ...readPassSync(), ...change };
  storage.set(SYNC_KEY, JSON.stringify(next));
  cachedSync = next;
  notify();
}

/** A relaunch: the in-memory copies go, what was persisted stays. */
export function forgetCachedDraftForTests(): void {
  cachedDraft = undefined;
  cachedSync = undefined;
}

/** Forgets the pass in progress, so the next account on this phone onboards from the start. */
export function clearPassDraft(): void {
  storage.remove(DRAFT_KEY);
  storage.remove(SYNC_KEY);
  cachedDraft = undefined;
  cachedSync = undefined;
  notify();
}

export const clearDraftForTests = clearPassDraft;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePassDraft(): PassDraft | null {
  return useSyncExternalStore(subscribe, readDraft);
}

export function usePassSync(): PassSyncState {
  return useSyncExternalStore(subscribe, readPassSync);
}
