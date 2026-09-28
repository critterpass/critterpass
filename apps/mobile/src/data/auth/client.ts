/**
 * The real Better Auth Expo client (docs/system-architecture.md §11 S-AUTH): SecureStore-backed
 * cookie persistence via `@better-auth/expo`'s client plugin, with the client-side half of every
 * server plugin services/api/src/auth/config.ts mounts (anonymous, phoneNumber, admin) so their typed
 * methods exist on the returned client. Every auth call the app makes goes through this one client.
 */
import { expoClient, type ExpoClientStorage } from '@better-auth/expo/client';
import { createAuthClient, type BetterAuthClientPlugin } from 'better-auth/client';
import { adminClient, anonymousClient, phoneNumberClient } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';

export interface CreateMobileAuthClientConfig {
  readonly baseUrl: string;
  /** The app's own URL scheme (app.config.ts), for the Expo client's OAuth-redirect callback. */
  readonly scheme: string;
  /** Cookie and session-cache storage; SecureStore on device. */
  readonly storage?: ExpoClientStorage;
  /** The HTTP transport; the platform `fetch` on device. */
  readonly fetchImpl?: typeof fetch;
}

/** The origin the api trusts for this app variant (services/api/src/auth/bootstrap.ts). */
export function appOrigin(scheme: string): string {
  return `${scheme}://`;
}

/**
 * Better Auth's server checks the `Origin` of every cookie-bearing POST, and its Expo server plugin
 * reads that origin from the `expo-origin` header. `@better-auth/expo`'s client adds the header to
 * most requests but deliberately leaves it off ID-token requests (`linkSocial` / `signIn.social`
 * with `idToken`) while still sending the session cookie on `/link-social`, so the server answers
 * `403 MISSING_OR_NULL_ORIGIN` to every Apple and Google link from an anonymous session. This
 * fetch plugin runs after the Expo one and sets the header on every request.
 */
function expoOriginOnEveryRequest(scheme: string) {
  const origin = appOrigin(scheme);
  return {
    id: 'expo-origin',
    fetchPlugins: [
      {
        id: 'expo-origin',
        name: 'expo-origin',
        init(url, options) {
          return {
            url,
            options: { ...options, headers: { ...options?.headers, 'expo-origin': origin } },
          };
        },
      },
    ],
  } satisfies BetterAuthClientPlugin;
}

export function createMobileAuthClient(config: CreateMobileAuthClientConfig) {
  return createAuthClient({
    baseURL: config.baseUrl,
    ...(config.fetchImpl ? { fetchOptions: { customFetchImpl: config.fetchImpl } } : {}),
    plugins: [
      anonymousClient(),
      phoneNumberClient(),
      adminClient(),
      expoClient({ scheme: config.scheme, storage: config.storage ?? SecureStore }),
      expoOriginOnEveryRequest(config.scheme),
    ],
  });
}

export type MobileAuthClient = ReturnType<typeof createMobileAuthClient>;
