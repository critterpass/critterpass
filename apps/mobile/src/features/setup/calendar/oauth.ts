/**
 * Connecting a Google or Outlook calendar (free/busy only): the api mints a session-bound `state`
 * and answers the provider's authorize URL, which opens in the system browser. The provider sends
 * the member back to `critterpass://setup/calendar/connected`, where `connect_calendar` finishes
 * with the returned code and state from this same device.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and wire values, never copy. */
import { generateUuidV7, type OAuthCalendarProvider } from '@cp/domain';
import * as SecureStore from 'expo-secure-store';

import { loadOrCreateDeviceId } from '@/data/commands/device';

import type { SetupServices } from '../data/services';

export type OAuthStart =
  { readonly kind: 'opened' } | { readonly kind: 'failed'; readonly code: string };

/** This install's command device id (the one `connect_calendar`'s envelope carries). */
export function installDeviceId(): Promise<string> {
  return loadOrCreateDeviceId(SecureStore, generateUuidV7);
}

function authorizeUrl(body: unknown): string | null {
  const url = (body as { authorize_url?: unknown } | null)?.authorize_url;
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
}

export async function startCalendarOAuth(
  services: Pick<SetupServices, 'getJson' | 'openUrl'>,
  provider: OAuthCalendarProvider,
  deviceId: string,
  tentative: boolean,
): Promise<OAuthStart> {
  const query = `device_id=${encodeURIComponent(deviceId)}&tentative=${tentative ? '1' : '0'}`;
  const read = await services.getJson(`/v1/calendar/oauth/${provider}/start?${query}`);
  if (read.kind === 'offline') return { kind: 'failed', code: 'NETWORK' };
  if (read.kind === 'error') return { kind: 'failed', code: read.code };
  const url = authorizeUrl(read.body);
  if (url === null) return { kind: 'failed', code: 'UNKNOWN' };
  await services.openUrl(url);
  return { kind: 'opened' };
}

export type OAuthReturn =
  | {
      readonly kind: 'authorized';
      readonly provider: OAuthCalendarProvider;
      readonly state: string;
      readonly code: string;
    }
  | { readonly kind: 'denied' | 'failed'; readonly provider: OAuthCalendarProvider | null };

/** The query the provider's redirect brings back (`provider`, `status`, `state`, `code`). */
export function parseOAuthReturn(
  params: Readonly<Record<string, string | string[] | undefined>>,
): OAuthReturn {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === 'string' ? value : undefined;
  };
  const raw = one('provider');
  const provider = raw === 'google' || raw === 'microsoft' ? raw : null;
  const state = one('state');
  const code = one('code');
  if (
    one('status') === 'authorized' &&
    provider !== null &&
    state !== undefined &&
    code !== undefined
  ) {
    return { kind: 'authorized', provider, state, code };
  }
  return { kind: one('status') === 'denied' ? 'denied' : 'failed', provider };
}
