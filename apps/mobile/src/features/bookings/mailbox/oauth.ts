/**
 * Connecting a Gmail or Outlook mailbox (Pass+, read-only, confirmations only): the api mints a
 * session-bound `state` and answers the provider's authorize URL, which opens in the system
 * browser. The provider sends the member back to `critterpass://wallet/mailbox/connected`, where
 * `connect_mailbox` finishes with the returned code and state from this same device.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and wire values, never copy. */
import { generateUuidV7, type MailboxConnectionWire, type MailboxProvider } from '@cp/domain';
import * as SecureStore from 'expo-secure-store';

import { loadOrCreateDeviceId } from '@/data/commands/device';

import type { BookingsServices } from '../data/services';

export type MailboxStart =
  { readonly kind: 'opened' } | { readonly kind: 'failed'; readonly code: string };

export function installDeviceId(): Promise<string> {
  return loadOrCreateDeviceId(SecureStore, generateUuidV7);
}

function authorizeUrl(body: unknown): string | null {
  const url = (body as { authorize_url?: unknown } | null)?.authorize_url;
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
}

export async function startMailboxOAuth(
  services: Pick<BookingsServices, 'getJson' | 'openUrl'>,
  provider: MailboxProvider,
  deviceId: string,
): Promise<MailboxStart> {
  const read = await services.getJson(
    `/v1/mailbox/oauth/${provider}/start?device_id=${encodeURIComponent(deviceId)}`,
  );
  if (read.kind === 'offline') return { kind: 'failed', code: 'NETWORK' };
  if (read.kind === 'error') return { kind: 'failed', code: read.code };
  const url = authorizeUrl(read.value);
  if (url === null) return { kind: 'failed', code: 'UNKNOWN' };
  await services.openUrl(url);
  return { kind: 'opened' };
}

export async function loadConnections(
  services: Pick<BookingsServices, 'getJson'>,
): Promise<MailboxConnectionWire[] | null> {
  const read = await services.getJson('/v1/mailbox/connections');
  if (read.kind !== 'ok') return null;
  const list = (read.value as { connections?: unknown } | null)?.connections;
  return Array.isArray(list) ? (list as MailboxConnectionWire[]) : null;
}

export type MailboxReturn =
  | {
      readonly kind: 'authorized';
      readonly provider: MailboxProvider;
      readonly state: string;
      readonly code: string;
    }
  | { readonly kind: 'denied' | 'failed'; readonly provider: MailboxProvider | null };

/** The query the provider's redirect brings back (`provider`, `status`, `state`, `code`). */
export function parseMailboxReturn(
  params: Readonly<Record<string, string | string[] | undefined>>,
): MailboxReturn {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === 'string' ? value : undefined;
  };
  const raw = one('provider');
  const provider = raw === 'gmail' || raw === 'microsoft' ? raw : null;
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
