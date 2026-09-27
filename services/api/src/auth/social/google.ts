/**
 * Google ID-token verification (docs/api-contracts.md §5.1 `POST /api/auth/link-social`,
 * `POST /api/auth/sign-in/social`) and refresh-token revocation. `buildGoogleSocialProviderOptions`
 * produces the `GoogleOptions` object Better Auth's `socialProviders.google` accepts; `clientId`
 * lists iOS + Android + web OAuth client ids together (Google issues a different `aud` per platform
 * SDK) so any of them verifies. Same stubbed-`fetch` "network boundary double" as ./apple.ts in
 * tests — Google's own `/oauth2/v3/certs` JWKS endpoint, not this configuration.
 */
export interface GoogleProviderConfig {
  /** iOS, Android and web OAuth client ids (Google Cloud console); any may appear as the ID token's `aud`. */
  readonly clientIds: readonly string[];
}

interface GoogleSocialProviderOptions {
  readonly clientId: string[];
  readonly clientSecret: string;
}

/** Better Auth's `socialProviders.google` entry — pass straight into `buildAuthOptions`. */
export function buildGoogleSocialProviderOptions(
  config: GoogleProviderConfig,
): GoogleSocialProviderOptions {
  return { clientId: [...config.clientIds], clientSecret: 'unused-id-token-flow-only' };
}

export interface GoogleHttpClient {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

/** Revokes a previously captured Google refresh/access token (used on account deletion, phase 45, and unlink). */
export async function revokeGoogleToken(token: string, http: GoogleHttpClient): Promise<void> {
  const response = await http.fetch(GOOGLE_REVOKE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
  });
  if (!response.ok) {
    throw new Error(
      `google token revoke failed: ${response.status} ${await response.text().catch(() => '')}`,
    );
  }
}
