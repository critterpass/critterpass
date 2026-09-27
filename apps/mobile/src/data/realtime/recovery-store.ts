/**
 * Persisted stream positions for realtime channels (docs/api-contracts-async.md §1.1 "Recovery").
 * Every namespace with history runs `force_recovery`, so resubscribing with the last seen
 * `(offset, epoch)` replays exactly what was missed, even after the app was killed. Positions live
 * in MMKV so a cold start resumes where the last session stopped instead of reconciling everything
 * (./device-recovery-store.ts opens it). The store itself only needs a key-value interface, so the
 * realtime client also runs under plain Node (the end-to-end sync harness).
 */

/** The slice of an MMKV instance this store uses; `createMMKV()` returns one. */
export interface KeyValueStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): boolean;
  getAllKeys(): string[];
}

export interface StreamPositionRecord {
  readonly offset: number;
  readonly epoch: string;
}

export interface RecoveryStore {
  get(channel: string): StreamPositionRecord | undefined;
  set(channel: string, position: StreamPositionRecord): void;
  remove(channel: string): void;
  /** Drops every stored position, e.g. when the signed-in account changes. */
  clear(): void;
}

// eslint-disable-next-line lingui/no-unlocalized-strings -- storage key prefix, never rendered copy.
const KEY_PREFIX = 'rt.pos.';

function parsePosition(raw: string | undefined): StreamPositionRecord | undefined {
  if (raw === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return undefined;
    const { offset, epoch } = value as Record<string, unknown>;
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) return undefined;
    if (typeof epoch !== 'string') return undefined;
    return { offset, epoch };
  } catch {
    return undefined;
  }
}

export function createRecoveryStore(storage: KeyValueStorage): RecoveryStore {
  return {
    get: (channel) => parsePosition(storage.getString(KEY_PREFIX + channel)),
    set: (channel, position) => {
      storage.set(
        KEY_PREFIX + channel,
        JSON.stringify({ offset: position.offset, epoch: position.epoch }),
      );
    },
    remove: (channel) => {
      storage.remove(KEY_PREFIX + channel);
    },
    clear: () => {
      for (const key of storage.getAllKeys()) {
        if (key.startsWith(KEY_PREFIX)) storage.remove(key);
      }
    },
  };
}
