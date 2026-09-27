/**
 * Cloudflare Access (Zero Trust) in front of the console host: the admin Worker forwards the
 * `Cf-Access-Jwt-Assertion` Access issued for the signed-in operator, and the api refuses every
 * `/v1/admin/*` request without a valid one, so calling `api.` directly never reaches the console
 * routes. Configured by `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD`; required in production.
 */
import { DomainError } from '@cp/domain';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';

export interface AccessConfig {
  /** `<team>.cloudflareaccess.com` */
  readonly teamDomain: string;
  /** The Access application's audience tag. */
  readonly audience: string;
  /** Defaults to the team's published certs; tests pass a local key set. */
  readonly keys?: JWTVerifyGetKey | undefined;
}

export type AccessVerifier = (headers: Headers) => Promise<void>;

export function createAccessVerifier(config: AccessConfig): AccessVerifier {
  const issuer = `https://${config.teamDomain}`;
  const keys = config.keys ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  return async (headers) => {
    const token = headers.get(ACCESS_JWT_HEADER);
    if (token === null || token.length === 0) {
      throw new DomainError('AUTH_REQUIRED', { reason: 'access_required' });
    }
    try {
      await jwtVerify(token, keys, { issuer, audience: config.audience });
    } catch {
      throw new DomainError('AUTH_REQUIRED', { reason: 'access_invalid' });
    }
  };
}
