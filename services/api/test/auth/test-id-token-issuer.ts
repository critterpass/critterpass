/**
 * A local stand-in for Apple's and Google's ID-token issuers. Both providers verify RS256, so an
 * RS256 keypair served as the JWKS response through a stubbed `fetch` is the network-boundary
 * double; issuer, audience, nonce, expiry and signature checks all run through the real
 * `@better-auth/core` verifier untouched.
 */
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

export interface LocalIdTokenIssuer {
  readonly jwks: { keys: Array<Record<string, unknown>> };
  sign(claims: Record<string, unknown>): Promise<string>;
}

export async function buildLocalIssuer(): Promise<LocalIdTokenIssuer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const kid = crypto.randomUUID();
  const publicJwk = await exportJWK(publicKey);
  const jwk = { ...publicJwk, kid, alg: 'RS256', use: 'sig' };
  return {
    jwks: { keys: [jwk] },
    sign: async (claims) => {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({ iat: now, ...claims })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuedAt(now)
        .setExpirationTime(now + 600)
        .sign(privateKey);
    },
  };
}

export function jwksResponse(jwks: LocalIdTokenIssuer['jwks']): Response {
  return new Response(JSON.stringify(jwks), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
