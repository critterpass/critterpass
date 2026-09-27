/**
 * Single-use attestation challenges (docs/api-contracts.md §5.1 `POST /v1/attest/challenge`;
 * phase-9 F-029): Redis-backed, 5 min TTL, bound to the install id that requested it. Every
 * assertion (App Attest) or integrity token (Play Integrity nonce) must consume exactly one of
 * these; a second attempt to consume the same challenge fails because `getDel` is atomic —
 * whichever caller's read wins deletes the key, so a concurrent replay finds nothing.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

export interface ChallengeRedisClient {
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  getDel(key: string): Promise<string | null>;
}

const CHALLENGE_TTL_SECONDS = 300;
const CHALLENGE_BYTES = 32;

function challengeKey(installId: string): string {
  return `attest:challenge:${installId}`;
}

/** Issues a fresh challenge for one install id, overwriting any still-unconsumed previous one. */
export async function issueChallenge(
  redis: ChallengeRedisClient,
  installId: string,
): Promise<{ challenge: string }> {
  const challenge = randomBytes(CHALLENGE_BYTES).toString('base64url');
  await redis.set(challengeKey(installId), challenge, { EX: CHALLENGE_TTL_SECONDS });
  return { challenge };
}

/**
 * Consumes (deletes) the challenge issued for `installId` and reports whether `providedChallenge`
 * matches it. Returns `false` for "no challenge was ever issued", "it already expired" and "it was
 * already consumed" alike — the caller (services/api/src/abuse/attestation/index.ts) turns any
 * `false` into the same `ATTESTATION_FAILED`, never distinguishing which case it was.
 */
export async function consumeChallenge(
  redis: ChallengeRedisClient,
  installId: string,
  providedChallenge: string,
): Promise<boolean> {
  const stored = await redis.getDel(challengeKey(installId));
  if (stored === null) return false;
  const storedBuffer = Buffer.from(stored);
  const providedBuffer = Buffer.from(providedChallenge);
  if (storedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(storedBuffer, providedBuffer);
}
