/**
 * Persisted stream positions for realtime channels (docs/api-contracts-async.md §1.1 "Recovery").
 * Every namespace with history runs `force_recovery`, so resubscribing with the last seen
 * `(offset, epoch)` replays exactly what was missed, even after the app was killed. Positions live
 * in MMKV so a cold start resumes where the last session stopped instead of reconciling everything.
 */
import { createMMKV } from 'react-native-mmkv';

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

/* eslint-disable lingui/no-unlocalized-strings -- MMKV storage ids and keys, never rendered copy. */
const STORAGE_ID = 'cp-realtime';
const KEY_PREFIX = 'rt.pos.';
/* eslint-enable lingui/no-unlocalized-strings */

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

export function createRecoveryStore(
  storage: KeyValueStorage = createMMKV({ id: STORAGE_ID }),
): RecoveryStore {
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
