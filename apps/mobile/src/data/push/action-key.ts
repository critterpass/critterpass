/**
 * The device action key the app hands to its extensions (docs/api-contracts-async.md §5): issued by
 * `POST /v1/devices/{id}/action-keys`, stored in the shared Keychain access group so widgets, Live
 * Activity intents and the notification service extension can sign `/v1/actions` requests without
 * the app, and rotated on foreground once fewer than 7 days remain. The app itself never signs a
 * request: it has a session. The stored JSON is read back byte-for-byte by
 * `targets/_shared/ActionKey/ActionKeyStore.swift`, so its field names are a contract.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: storage keys, API paths and
   developer-facing error messages, never rendered copy. */

export const ROTATE_WHEN_REMAINING_MS = 7 * 24 * 60 * 60 * 1000;

/** Keychain item every target reads (`ActionKeyStore.swift` uses the same service and account). */
export const ACTION_KEY_KEYCHAIN = {
  account: 'device-action-key',
  keychainService: 'app.critterpass.actions',
  /** `$(AppIdentifierPrefix)app.critterpass.shared`, resolved: runtime code needs the literal. */
  accessGroup: 'YFND2EEW8S.app.critterpass.shared',
} as const;

export interface StoredActionKey {
  readonly key_id: string;
  readonly secret: string;
  readonly scopes: readonly string[];
  readonly expires_at: string;
  readonly device_id: string;
  /** The key's owner, for the envelope's `actor.uid` (the server always acts as the key's user). */
  readonly user_id: string;
}

export interface ActionKeyStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}

/** `fetch`-shaped call against the api with the session attached. */
export type ActionKeyHttp = (
  path: string,
  init: { method: 'POST' | 'DELETE'; body?: string },
) => Promise<{ status: number; json(): Promise<unknown> }>;

export class ActionKeyError extends Error {
  constructor(readonly status: number) {
    super(`action key request failed with HTTP ${status}`);
    this.name = 'ActionKeyError';
  }
}

function parseStored(raw: string | null): StoredActionKey | undefined {
  if (raw === null) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<StoredActionKey>;
    if (
      typeof value.key_id === 'string' &&
      typeof value.secret === 'string' &&
      typeof value.expires_at === 'string' &&
      typeof value.device_id === 'string' &&
      typeof value.user_id === 'string' &&
      Array.isArray(value.scopes)
    ) {
      return value as StoredActionKey;
    }
  } catch {
    // A corrupt item is treated as absent and replaced below.
  }
  return undefined;
}

async function requestKey(
  http: ActionKeyHttp,
  owner: { readonly deviceId: string; readonly userId: string },
  body: Record<string, unknown>,
): Promise<StoredActionKey | 'not_due' | 'unknown_key'> {
  const { deviceId, userId } = owner;
  const response = await http(`/v1/devices/${deviceId}/action-keys`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (response.status === 201) {
    const issued = (await response.json()) as Omit<StoredActionKey, 'device_id' | 'user_id'>;
    return { ...issued, device_id: deviceId, user_id: userId };
  }
  if (response.status === 409 && 'rotate_key_id' in body) return 'not_due';
  if (response.status === 404 && 'rotate_key_id' in body) return 'unknown_key';
  throw new ActionKeyError(response.status);
}

/**
 * Makes sure a usable key for `deviceId` is in the shared Keychain: issues one when there is none
 * (or it belongs to another install, or has expired) and rotates one with under 7 days left.
 * Call after `register_device` succeeded (the install must exist server-side) and on foreground.
 */
export async function ensureActionKey(input: {
  readonly storage: ActionKeyStorage;
  readonly http: ActionKeyHttp;
  readonly deviceId: string;
  readonly userId: string;
  readonly now?: number;
}): Promise<StoredActionKey> {
  const owner = { deviceId: input.deviceId, userId: input.userId };
  const now = input.now ?? Date.now();
  const stored = parseStored(await input.storage.read());
  const usable =
    stored !== undefined &&
    stored.device_id === input.deviceId &&
    stored.user_id === input.userId &&
    Date.parse(stored.expires_at) > now;

  let next: StoredActionKey | 'not_due' | 'unknown_key';
  if (!usable) {
    next = await requestKey(input.http, owner, {});
  } else if (Date.parse(stored.expires_at) - now >= ROTATE_WHEN_REMAINING_MS) {
    return stored;
  } else {
    next = await requestKey(input.http, owner, { rotate_key_id: stored.key_id });
    if (next === 'not_due') return stored;
    if (next === 'unknown_key') next = await requestKey(input.http, owner, {});
  }
  if (typeof next === 'string') throw new ActionKeyError(409);
  await input.storage.write(JSON.stringify(next));
  return next;
}

/** Forgets the local key (sign-out, account switch); the server revokes its copy itself. */
export async function clearActionKey(storage: ActionKeyStorage): Promise<void> {
  await storage.remove();
}
