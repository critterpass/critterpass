/**
 * The app's one Better Auth Expo client and the session headers api reads send. Kept apart from
 * `device-session.ts` so a data hook can sign its requests without loading the local database.
 */
import Constants from 'expo-constants';

import { createMobileAuthClient, type MobileAuthClient } from '../auth/client';
import { createDeviceAttestor } from '../auth/device-attestor';
import { resolveApiBaseUrl } from '../places/apiBaseUrl';

function appScheme(): string {
  const scheme = Constants.expoConfig?.scheme;
  const first = Array.isArray(scheme) ? scheme[0] : scheme;
  return first ?? 'critterpass';
}

let client: MobileAuthClient | null = null;

export function authClient(): MobileAuthClient {
  client ??= createMobileAuthClient({
    baseUrl: resolveApiBaseUrl(),
    scheme: appScheme(),
    attestor: createDeviceAttestor(resolveApiBaseUrl()),
  });
  return client;
}

/** The session cookie for authenticated api requests outside the command path (presign, geo). */
export async function sessionHeaders(): Promise<Record<string, string>> {
  return { cookie: await authClient().getCookie() };
}
