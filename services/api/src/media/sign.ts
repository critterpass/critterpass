/**
 * Read-URL minting for the media Worker (docs/api-contracts.md §5.4): HMAC-SHA256 over
 * `{object_key}|{variant}|{exp}` with the active key of `MEDIA_HMAC_KEYS` (rotated by `kid`), the
 * same `signMediaUrl` the Worker's `verifyMediaSignature` checks against.
 */
import { signMediaUrl } from '@cp/domain';
import { z } from 'zod';

/** Read URLs live 15 minutes; clients re-mint rather than cache them. */
export const READ_URL_TTL_SECONDS = 15 * 60;
export const ORIGINAL_VARIANT = 'orig';

export interface MediaSigningConfig {
  readonly baseUrl: string;
  readonly keyId: string;
  readonly secret: string;
}

const keySetSchema = z.record(z.string().min(1), z.string().min(32));

/**
 * Builds the signing config from `MEDIA_HMAC_KEYS` (`{"kid": "secret", ...}`) and the active kid.
 * Throws with a message naming the variable, never its value, when the pair is inconsistent.
 */
export function mediaSigningConfigFromEnv(input: {
  readonly baseUrl: string;
  readonly keysJson: string;
  readonly activeKeyId: string;
}): MediaSigningConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.keysJson);
  } catch {
    throw new Error('MEDIA_HMAC_KEYS must be a JSON object of {kid: secret}');
  }
  const keys = keySetSchema.safeParse(parsed);
  if (!keys.success) {
    throw new Error('MEDIA_HMAC_KEYS must map key ids to secrets of at least 32 characters');
  }
  const secret = keys.data[input.activeKeyId];
  if (secret === undefined) {
    throw new Error('MEDIA_HMAC_ACTIVE_KID must name a key in MEDIA_HMAC_KEYS');
  }
  return { baseUrl: input.baseUrl, keyId: input.activeKeyId, secret };
}

export function mintReadUrl(
  config: MediaSigningConfig,
  objectKey: string,
  expiresAt: number,
): Promise<string> {
  return signMediaUrl({
    baseUrl: config.baseUrl,
    objectKey,
    variant: ORIGINAL_VARIANT,
    expiresAt,
    keyId: config.keyId,
    secret: config.secret,
  });
}
