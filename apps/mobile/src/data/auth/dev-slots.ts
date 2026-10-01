/**
 * Test accounts for device flows that need two people on one phone (an organiser and a friend):
 * the signed-in session is kept in a SecureStore slot, and the phone either starts a brand-new
 * account or goes back to a kept one. Only what the auth client already stores is copied (its
 * cookie and session cache, chunks included). Every switch first runs the sign-out cleanup
 * (local database, PowerSync, realtime, push) without signing out on the server, so two accounts
 * never share one local database, and the caller then reloads the app. Developer tools only: the
 * (dev) route is the one importer, and release bundles exclude it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- storage keys, never copy. */
import { runOnSignOutHooks } from './sign-out-hooks';

export interface KeyStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface DevSlot {
  readonly uid: string;
  readonly label: string;
  readonly savedAt: string;
}

const AUTH_KEYS = ['better-auth_cookie', 'better-auth_session_data'] as const;
const MAX_CHUNKS = 8;
const INDEX_KEY = 'cp-dev-slots';

/** The auth client's keys, with the chunk keys a long value may be split across. */
function liveKeys(): string[] {
  const keys: string[] = [];
  for (const base of AUTH_KEYS) {
    keys.push(base);
    for (let i = 0; i < MAX_CHUNKS; i += 1) {
      keys.push(`${base}.${i}`, `${base}.0.${i}`, `${base}.1.${i}`);
    }
  }
  return keys;
}

const slotKey = (uid: string, key: string) => `cp-dev-slot.${uid}.${key}`;

export function createDevSlots(store: KeyStore, cleanup: () => Promise<void> = runOnSignOutHooks) {
  async function list(): Promise<DevSlot[]> {
    const raw = await store.getItemAsync(INDEX_KEY);
    if (raw === null) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as DevSlot[]) : [];
    } catch {
      return [];
    }
  }

  async function copy(from: (key: string) => string, to: (key: string) => string) {
    for (const key of liveKeys()) {
      const value = await store.getItemAsync(from(key));
      if (value === null || value === '') await store.deleteItemAsync(to(key));
      else await store.setItemAsync(to(key), value);
    }
  }

  /** Keeps the signed-in session under its uid (replacing an older copy). */
  async function keep(uid: string, label: string, now = new Date()): Promise<void> {
    await copy(
      (key) => key,
      (key) => slotKey(uid, key),
    );
    // A kept account keeps its place in the list, so its switch button stays where it was.
    const entry = { uid, label, savedAt: now.toISOString() };
    const current = await list();
    const slots = current.some((slot) => slot.uid === uid)
      ? current.map((slot) => (slot.uid === uid ? entry : slot))
      : [...current, entry];
    await store.setItemAsync(INDEX_KEY, JSON.stringify(slots));
  }

  /** Clears this phone's local data, then signs `uid`'s kept session in (or none: a new account). */
  async function switchTo(uid: string | null): Promise<void> {
    if (uid !== null && !(await list()).some((slot) => slot.uid === uid)) {
      throw new Error('no such test account');
    }
    await cleanup();
    if (uid === null) {
      for (const key of liveKeys()) await store.deleteItemAsync(key);
      return;
    }
    await copy(
      (key) => slotKey(uid, key),
      (key) => key,
    );
  }

  /** Forgets every kept account; the signed-in one stays signed in. */
  async function clear(): Promise<void> {
    for (const slot of await list()) {
      for (const key of liveKeys()) await store.deleteItemAsync(slotKey(slot.uid, key));
    }
    await store.deleteItemAsync(INDEX_KEY);
  }

  return { list, keep, switchTo, clear };
}

export type DevSlots = ReturnType<typeof createDevSlots>;
