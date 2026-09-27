/**
 * The real Better Auth Expo client (docs/system-architecture.md §11 S-AUTH): SecureStore-backed
 * cookie persistence via `@better-auth/expo`'s client plugin, with the client-side half of every
 * server plugin services/api/src/auth/config.ts mounts (anonymous, phoneNumber, admin) so their typed
 * methods exist on the returned client. Not unit-tested directly — it wires real native/network
 * dependencies (SecureStore, `expo-web-browser`) with no substitute in this Jest-only lane; every
 * other module in this directory takes a narrow client interface instead and is tested against a fake
 * one (code-standards.md §17).
 */
import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/client';
import { adminClient, anonymousClient, phoneNumberClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';

export interface CreateMobileAuthClientConfig {
  readonly baseUrl: string;
  /** The app's own URL scheme (app.config.ts), for the Expo client's OAuth-redirect callback. */
  readonly scheme: string;
}

export function createMobileAuthClient(config: CreateMobileAuthClientConfig) {
  return createAuthClient({
    baseURL: config.baseUrl,
    plugins: [
      anonymousClient(),
      phoneNumberClient(),
      adminClient(),
      expoClient({ scheme: config.scheme, storage: SecureStore }),
    ],
  });
}

export type MobileAuthClient = ReturnType<typeof createMobileAuthClient>;
