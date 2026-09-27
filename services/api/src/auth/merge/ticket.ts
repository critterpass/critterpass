/**
 * Merge tickets (docs/api-contracts.md §5.1 `POST /v1/auth/merge-ticket`, `POST /v1/auth/merge`;
 * Requirements "Conflict → merge"). Minted only by the failed `/link-social` or
 * `/phone-number/verify` handler that just proved control of the existing identity
 * (services/api/src/auth/hooks.ts's `buildMergeInterceptAfterHook`) — this module has no standalone
 * "issue a ticket" entry point on purpose. A ticket is a signed, self-contained bearer token (HMAC-
 * SHA256 over its own payload, the same secret Better Auth signs sessions with) carrying exactly the
 * four facts the merge preview/execute routes need; single-use is enforced separately, in Redis, by
 * the caller consuming a ticket's `nonce` (`consumeMergeTicket`) — this module only proves a ticket
 * is authentic and unexpired, not whether it has already been spent.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TICKET_TTL_SECONDS = 600;

export type MergeTicketProvider = 'apple' | 'google';

export interface MergeTicketClaims {
  /** `social`: a `/link-social` conflict (`provider` set); `phone`: a `/phone-number/verify` conflict. */
  readonly kind: 'social' | 'phone';
  readonly existingUid: string;
  readonly anonUid: string;
  readonly anonSessionId: string;
  readonly provider?: MergeTicketProvider;
}

export interface MergeTicketPayload extends MergeTicketClaims {
  readonly nonce: string;
  readonly iat: number;
  readonly exp: number;
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/** Mints a single-use-capable, 10-minute merge ticket. Never call this from anywhere but the handler that just verified the conflicting credential. */
export function mintMergeTicket(claims: MergeTicketClaims, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: MergeTicketPayload = {
    ...claims,
    nonce: randomBytes(16).toString('base64url'),
    iat: now,
    exp: now + TICKET_TTL_SECONDS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/** Verifies signature + expiry only; returns `undefined` on any tamper, malformed, or expired ticket. Does not check single-use — see `consumeMergeTicket`. */
export function verifyMergeTicket(ticket: string, secret: string): MergeTicketPayload | undefined {
  const separatorIndex = ticket.indexOf('.');
  if (separatorIndex === -1) return undefined;
  const payloadB64 = ticket.slice(0, separatorIndex);
  const signature = ticket.slice(separatorIndex + 1);
  if (!payloadB64 || !signature) return undefined;

  const expected = Buffer.from(sign(payloadB64, secret), 'base64url');
  const given = Buffer.from(signature, 'base64url');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;

  let payload: MergeTicketPayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as MergeTicketPayload;
  } catch {
    return undefined;
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000))
    return undefined;
  if (
    typeof payload.existingUid !== 'string' ||
    typeof payload.anonUid !== 'string' ||
    typeof payload.anonSessionId !== 'string' ||
    typeof payload.nonce !== 'string'
  ) {
    return undefined;
  }
  return payload;
}

export interface MergeTicketRedisClient {
  /** node-redis's `set(key, value, {NX: true, EX: seconds})`; resolves `null` when the key already exists. */
  set(key: string, value: string, options: { NX: true; EX: number }): Promise<string | null>;
}

const CONSUMED_TICKET_PREFIX = 'auth:merge-ticket:consumed:';

/** Atomically marks a ticket's `nonce` as spent. Returns `true` the first time, `false` on any replay — "replaying ticket fails". */
export async function consumeMergeTicket(
  redis: MergeTicketRedisClient,
  payload: MergeTicketPayload,
): Promise<boolean> {
  const ttl = Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
  const result = await redis.set(`${CONSUMED_TICKET_PREFIX}${payload.nonce}`, '1', {
    NX: true,
    EX: ttl,
  });
  return result !== null;
}
