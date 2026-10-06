/**
 * The driver directory's reads over HTTPS with the session headers (the directory is never
 * synced): the directory list and a driver's detail, and the trip's own drivers. The last directory
 * answer is kept on the phone, so the filters still work offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes and wire values, never copy. */
import type { DriverDirectoryDetail, DriverDirectoryList, OurDrivers } from '@cp/domain';
import { createMMKV } from 'react-native-mmkv';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

export type DriversOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'offline' }
  | { readonly kind: 'error'; readonly code: string };

async function get<T>(path: string): Promise<DriversOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      headers: { accept: 'application/json', ...(await sessionHeaders()) },
    });
  } catch {
    return { kind: 'offline' };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    return { kind: 'error', code: typeof code === 'string' ? code : `HTTP_${response.status}` };
  }
  return { kind: 'ok', value: body as T };
}

// createMMKV() returns its own in-memory store under Jest, so tests use the real module.
const storage = createMMKV({ id: 'cp-driver-directory' });
const LAST_DIRECTORY = 'last-directory';

export interface CachedDirectory {
  readonly list: DriverDirectoryList;
  readonly fetchedAt: string;
}

export function lastDirectory(): CachedDirectory | null {
  const raw = storage.getString(LAST_DIRECTORY);
  if (raw === undefined) return null;
  try {
    return JSON.parse(raw) as CachedDirectory;
  } catch {
    return null;
  }
}

/** Every listed driver (filters run on the phone, so they work from the last answer offline). */
export async function fetchDirectory(): Promise<DriversOutcome<DriverDirectoryList>> {
  const outcome = await get<DriverDirectoryList>('/v1/driver-directory');
  if (outcome.kind === 'ok') {
    const cached: CachedDirectory = { list: outcome.value, fetchedAt: new Date().toISOString() };
    storage.set(LAST_DIRECTORY, JSON.stringify(cached));
  }
  return outcome;
}

export function fetchDriverDetail(id: string): Promise<DriversOutcome<DriverDirectoryDetail>> {
  return get<DriverDirectoryDetail>(`/v1/driver-directory/${encodeURIComponent(id)}`);
}

export function fetchOurDrivers(tripId: string): Promise<DriversOutcome<OurDrivers>> {
  return get<OurDrivers>(`/v1/trips/${encodeURIComponent(tripId)}/drivers`);
}
