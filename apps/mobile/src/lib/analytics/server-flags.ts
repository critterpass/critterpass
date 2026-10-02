/**
 * The flag values the api evaluated for this account (`GET /v1/config/bootstrap`,
 * docs/api-contracts.md §5.5). They are read before PostHog's own value (./flags.ts), so a rollout
 * reaches the app whatever the analytics consent, and the app itself asks PostHog nothing for it.
 *
 * Each value is kept in MMKV under its catalog key, so an offline launch starts with the last
 * answer. A refresh that fails (offline, an api error, an answer in another shape) changes
 * nothing; signing out forgets the account's values.
 */
import { coerceFlag, FLAG_CATALOG, FLAG_KEYS, type FlagKey, type FlagValues } from '@cp/domain';
import { createMMKV } from 'react-native-mmkv';

export const SERVER_FLAGS_PATH = '/v1/config/bootstrap';

/** The signed-in GET of `SERVER_FLAGS_PATH`: any status resolves; only no response rejects. */
export type ServerFlagsFetch = () => Promise<{ readonly status: number; readonly body: unknown }>;

/** The slice of React Native's `AppState` the refresh listens to. */
export interface ServerFlagsAppState {
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

// createMMKV() returns its own in-memory store under Jest, so tests use the real module.
let storage: ReturnType<typeof createMMKV> | undefined;
const store = () => (storage ??= createMMKV({ id: 'cp-server-flags' }));

const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
/** Bumped when the account's values are forgotten, so an answer still in flight is dropped. */
let generation = 0;

function stored(key: FlagKey): unknown {
  const kind: string = FLAG_CATALOG[key].kind;
  return kind === 'boolean' ? store().getBoolean(key) : store().getString(key);
}

/** A value counts only when the catalog accepts it for that flag. */
function accepted<K extends FlagKey>(key: K, raw: unknown): FlagValues[K] | undefined {
  if (raw === undefined) return undefined;
  const value = coerceFlag(key, raw, FLAG_CATALOG);
  return value === raw ? value : undefined;
}

/** The api's value for `key`, or undefined when it has not given a valid one. */
export function serverFlag<K extends FlagKey>(key: K): FlagValues[K] | undefined {
  return accepted(key, stored(key));
}

export function subscribeServerFlags(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Stores a `{flags}` answer; false (and nothing changed) when the body is not one. */
export function applyServerFlags(body: unknown): boolean {
  const flags = (body as { flags?: unknown } | null)?.flags;
  if (typeof flags !== 'object' || flags === null) return false;
  const answered = flags as Readonly<Record<string, unknown>>;
  for (const key of FLAG_KEYS) {
    const value = accepted(key, answered[key]);
    if (value === undefined) store().remove(key);
    else store().set(key, value);
  }
  notify();
  return true;
}

export function clearServerFlags(): void {
  generation += 1;
  store().clearAll();
  notify();
}

/** Asks the api once. Rejects when no response arrived; the stored values stay either way. */
export async function refreshServerFlags(fetchFlags: ServerFlagsFetch): Promise<void> {
  const asked = generation;
  const response = await fetchFlags();
  if (asked !== generation || response.status !== 200) return;
  applyServerFlags(response.body);
}

/**
 * Refreshes now and on every return to the foreground; concurrent triggers share one request.
 * Returns the function that stops listening.
 */
export function startServerFlags(options: {
  readonly fetchFlags: ServerFlagsFetch;
  readonly appState: ServerFlagsAppState;
  readonly onError?: (error: unknown) => void;
}): () => void {
  let running: Promise<void> | null = null;
  const refresh = () => {
    running ??= refreshServerFlags(options.fetchFlags)
      .catch((error: unknown) => options.onError?.(error))
      .finally(() => {
        running = null;
      });
  };
  const subscription = options.appState.addEventListener('change', (state) => {
    if (state === 'active') refresh();
  });
  refresh();
  return () => subscription.remove();
}
