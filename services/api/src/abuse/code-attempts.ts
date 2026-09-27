/**
 * Code-enumeration limiter, reusable across every code-guessing surface: join codes and gift/offer
 * codes (not wired to any caller yet). Tracks failed attempts per IP, per device and per uid
 * independently over a sliding window; once any one dimension crosses the threshold it locks that
 * dimension out for an exponentially growing period. `hashCode` is the recommended way a caller
 * looks up a submitted code: hash it, then let the database's own index equality do the comparison
 * (docs/data-model.md's `code_hash`/`seat_token_hash` pattern) — nothing here ever compares two code
 * strings directly, which is what makes the lookup constant-time rather than a byte-by-byte string
 * comparison in application code.
 */
import { createHash } from 'node:crypto';

export interface CodeAttemptsRedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string): Promise<number>;
}

export interface CodeAttemptIdentity {
  readonly ip: string;
  readonly device?: string | undefined;
  readonly uid?: string | undefined;
}

export interface LockoutStatus {
  readonly locked: boolean;
  readonly retryAfterS: number;
}

const WINDOW_SECONDS = 900;
/** Failures within the window before lockout starts; the 6th failure is the first one that locks. */
const LOCKOUT_THRESHOLD = 5;
const BASE_LOCKOUT_SECONDS = 30;
const MAX_LOCKOUT_SECONDS = 3600;

/** Not a peppered storage hash (packages/db/src/crypto's job for anything persisted) — this is purely the rate limiter's own lookup key, thrown away after `WINDOW_SECONDS`. */
export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function lockoutSecondsFor(failureCount: number): number {
  if (failureCount <= LOCKOUT_THRESHOLD) return 0;
  const exponent = failureCount - LOCKOUT_THRESHOLD - 1;
  return Math.min(MAX_LOCKOUT_SECONDS, BASE_LOCKOUT_SECONDS * 2 ** exponent);
}

function countKey(prefix: string, dimension: string): string {
  return `abuse:code-attempts:${prefix}:${dimension}:count`;
}

function lockKey(prefix: string, dimension: string): string {
  return `abuse:code-attempts:${prefix}:${dimension}:lock`;
}

function collectDimensions(
  identity: CodeAttemptIdentity,
): ReadonlyArray<readonly [string, string]> {
  const dimensions: Array<[string, string]> = [['ip', identity.ip]];
  if (identity.device) dimensions.push(['device', identity.device]);
  if (identity.uid) dimensions.push(['uid', identity.uid]);
  return dimensions;
}

function worstOf(results: readonly LockoutStatus[]): LockoutStatus {
  return results.reduce(
    (worst, current) => (current.retryAfterS > worst.retryAfterS ? current : worst),
    { locked: false, retryAfterS: 0 },
  );
}

async function dimensionLockStatus(
  redis: CodeAttemptsRedisClient,
  prefix: string,
  dimension: string,
): Promise<LockoutStatus> {
  const ttl = await redis.ttl(lockKey(prefix, dimension));
  return ttl > 0 ? { locked: true, retryAfterS: ttl } : { locked: false, retryAfterS: 0 };
}

/** Whether any dimension of this identity is currently locked out — call before attempting a code lookup at all. */
export async function isLockedOut(
  redis: CodeAttemptsRedisClient,
  identity: CodeAttemptIdentity,
): Promise<LockoutStatus> {
  const results = await Promise.all(
    collectDimensions(identity).map(([prefix, dimension]) =>
      dimensionLockStatus(redis, prefix, dimension),
    ),
  );
  return worstOf(results);
}

async function recordDimensionFailure(
  redis: CodeAttemptsRedisClient,
  prefix: string,
  dimension: string,
): Promise<LockoutStatus> {
  const key = countKey(prefix, dimension);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, WINDOW_SECONDS);
  const lockoutSeconds = lockoutSecondsFor(count);
  if (lockoutSeconds > 0) await redis.set(lockKey(prefix, dimension), '1', { EX: lockoutSeconds });
  return lockoutSeconds > 0
    ? { locked: true, retryAfterS: lockoutSeconds }
    : { locked: false, retryAfterS: 0 };
}

/** Records one failed code attempt across every dimension the identity provides, returning the worst (longest) lockout among them. */
export async function recordCodeAttemptFailure(
  redis: CodeAttemptsRedisClient,
  identity: CodeAttemptIdentity,
): Promise<LockoutStatus> {
  const results = await Promise.all(
    collectDimensions(identity).map(([prefix, dimension]) =>
      recordDimensionFailure(redis, prefix, dimension),
    ),
  );
  return worstOf(results);
}

/** A successful attempt clears that identity's failure history: a legitimate holder who eventually enters the right code should not stay penalised by an earlier attacker's failures. */
export async function recordCodeAttemptSuccess(
  redis: CodeAttemptsRedisClient,
  identity: CodeAttemptIdentity,
): Promise<void> {
  await Promise.all(
    collectDimensions(identity).flatMap(([prefix, dimension]) => [
      redis.del(countKey(prefix, dimension)),
      redis.del(lockKey(prefix, dimension)),
    ]),
  );
}
