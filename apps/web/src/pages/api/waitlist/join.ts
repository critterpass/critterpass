/* eslint-disable lingui/no-unlocalized-strings -- JSON error codes/keys, not JSX/UI copy. */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { deriveHandleBase } from '../../../lib/handle';
import { IP_HASH_SALT, decideRateLimit, hashIp } from '../../../lib/rate-limit';
import { isBodyTooLarge, isHoneypotTripped, normalizeEmail } from '../../../lib/validate';
import {
  countReferrals,
  findEntryByEmail,
  findEntryByHandle,
  handleTaken,
  insertEntry,
  rankOfEntry,
  readRateLimit,
  writeRateLimit,
} from '../../../lib/waitlist-repository';
import { findDestination, positionInLine } from '../../../lib/waitlist';

export const prerender = false;

interface JoinResponseBody {
  readonly handle: string;
  readonly position: number;
  readonly destination: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const GENERIC_INVALID = { error: 'invalid_request' } as const;
const MAX_HANDLE_ATTEMPTS = 50;

/** First free `base`, `base2`, `base3`, ... against a single D1 read per attempt. */
async function findFreeHandle(db: D1Database, base: string): Promise<string> {
  if (!(await handleTaken(db, base))) return base;
  for (let suffix = 2; suffix <= MAX_HANDLE_ATTEMPTS; suffix += 1) {
    const candidate = `${base}${suffix}`;
    // Sequential probing (not Promise.all) keeps D1 reads bounded and stops at the first free slot.
    if (!(await handleTaken(db, candidate))) return candidate;
  }
  throw new Error(`join: exhausted ${MAX_HANDLE_ATTEMPTS} handle attempts for base "${base}"`);
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (isBodyTooLarge(request.headers.get('content-length'))) {
    return jsonResponse(GENERIC_INVALID, 400);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(GENERIC_INVALID, 400);
  }
  if (typeof payload !== 'object' || payload === null) {
    return jsonResponse(GENERIC_INVALID, 400);
  }
  const body = payload as Record<string, unknown>;

  // Honeypot: a real visitor never fills this hidden field. Fail the same way as a bad email so a
  // bot can't tell which check tripped.
  if (isHoneypotTripped(body['company'])) {
    return jsonResponse(GENERIC_INVALID, 400);
  }

  const email = normalizeEmail(body['email']);
  if (email === null) {
    return jsonResponse(GENERIC_INVALID, 400);
  }

  const destinationKey = typeof body['destination'] === 'string' ? body['destination'] : '';
  const destination = findDestination(destinationKey);
  if (!destination) {
    return jsonResponse(GENERIC_INVALID, 400);
  }

  const db = env.DB;

  // Idempotent: an existing email returns its own place in line instead of erroring or duplicating.
  const existing = await findEntryByEmail(db, email);
  if (existing) {
    const [rank, referrals] = await Promise.all([
      rankOfEntry(db, existing.id),
      countReferrals(db, existing.handle),
    ]);
    const responseBody: JoinResponseBody = {
      handle: existing.handle,
      position: positionInLine(rank, referrals),
      destination: existing.destination,
    };
    return jsonResponse(responseBody, 200);
  }

  // Per-IP rate limit only guards brand-new sign-ups; a returning visitor above never reaches here.
  const ipHash = await hashIp(clientAddress ?? 'unknown', IP_HASH_SALT);
  const previousLimit = await readRateLimit(db, ipHash);
  const decision = decideRateLimit(previousLimit, Date.now());
  await writeRateLimit(db, ipHash, decision.next);
  if (decision.limited) {
    return jsonResponse({ error: 'rate_limited' }, 429);
  }

  const referredByCandidate = typeof body['referredBy'] === 'string' ? body['referredBy'] : null;
  const referrer = referredByCandidate ? await findEntryByHandle(db, referredByCandidate) : null;

  let handle: string;
  try {
    handle = await findFreeHandle(db, deriveHandleBase(email));
  } catch {
    return jsonResponse({ error: 'handle_exhausted' }, 500);
  }

  const created = await insertEntry(db, {
    email,
    handle,
    destination: destination.key,
    referredByHandle: referrer?.handle ?? null,
  });
  const rank = await rankOfEntry(db, created.id);
  const responseBody: JoinResponseBody = {
    handle: created.handle,
    position: positionInLine(rank, 0),
    destination: created.destination,
  };
  return jsonResponse(responseBody, 201);
};
