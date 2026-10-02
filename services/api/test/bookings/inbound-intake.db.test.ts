/**
 * Mail reaching a crew address, on the real stack. The Worker's report must carry a fresh, valid
 * signature. A member's verified email and a member's Apple private relay address are accepted and
 * queued for parsing; an unknown sender is quarantined and gets one "Link this email?" code (not a
 * second within ten minutes); the member who enters that code links the sender and releases the
 * waiting mail; the crew is asked for a code only once the Worker reports its reply sent, and a
 * refused reply clears the code; failed sender authentication is kept without a reply; a repeated
 * Message-ID is a duplicate; and after an organiser rotates the address, the old one is refused.
 */
import { crypto as dbCrypto, withSystem, withUser } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AccountLookup } from '../../src/bookings/sender-allow-list';
import { createVerifySenderEmailCommand } from '../../src/commands/bookings/verify-sender-email';
import { rotateInboundAddressCommand } from '../../src/commands/bookings/rotate-inbound-address';
import { registerInboundEmailWebhook } from '../../src/routes/webhooks/inbound-email';
import type { MoneyCrew, MoneyHarness } from '../money/money-harness';
import { buildMoneyCrew } from '../money/money-harness';
import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import { startBookingsHarness } from './bookings-harness';

const SECRET = 'inbound-shared-secret-at-least-32-characters';
const PEPPER = 'inbound-sender-pepper';

let harness: MoneyHarness;
let crew: MoneyCrew;
let localPart: string;
let messageSeq = 0;

/** The same read Better Auth's adapter makes: the account whose sign-in email this is. */
const lookup: AccountLookup = async (email) => {
  const { rows } = await harness.pool.query<{ id: string; email: string; verified: boolean }>(
    'SELECT id, email, email_verified AS verified FROM auth."user" WHERE lower(email) = $1',
    [email],
  );
  const row = rows[0];
  return row === undefined ? null : { uid: row.id, email: row.email, emailVerified: row.verified };
};

beforeAll(async () => {
  harness = await startBookingsHarness(
    (registry) => registry.register(rotateInboundAddressCommand),
    (app, deps) => {
      deps.registry.register(createVerifySenderEmailCommand({ pepper: PEPPER, redis: deps.redis }));
      registerInboundEmailWebhook(app, { pool: deps.pool, secret: SECRET, pepper: PEPPER, lookup });
    },
  );
  crew = await buildMoneyCrew(harness, 3);
  const [, maya, alex] = crew.members as [SignedIn, SignedIn, SignedIn];
  await harness.pool.query(
    `UPDATE auth."user" SET email = CASE id WHEN $1::uuid THEN 'maya@example.com'
       ELSE 'k7x2@privaterelay.appleid.com' END,
       email_verified = (id = $1::uuid), is_anonymous = false
     WHERE id IN ($1::uuid, $2::uuid)`,
    [maya.uid, alex.uid],
  );
  const { rows } = await harness.pool.query<{ local_part: string }>(
    "SELECT local_part FROM crew_inbound_addresses WHERE crew_id = $1 AND status = 'active'",
    [crew.crewId],
  );
  localPart = rows[0]!.local_part;
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

function report(from: string, extra: Record<string, unknown> = {}) {
  messageSeq += 1;
  return {
    local_part: localPart,
    from,
    message_id: `<msg-${messageSeq}@mail.example.com>`,
    size_bytes: 20_480,
    r2_key: `inbound/2026-09-30/raw-${messageSeq}.eml`,
    dkim: 'pass',
    spf: 'pass',
    received_at: new Date().toISOString(),
    ...extra,
  };
}

async function post(
  body: Record<string, unknown>,
  sign: { secret?: string; timestamp?: number; path?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const text = JSON.stringify(body);
  const timestamp = String(sign.timestamp ?? Math.floor(Date.now() / 1000));
  const response = await harness.request(sign.path ?? '/webhooks/inbound-email', {
    method: 'POST',
    headers: {
      'x-cp-timestamp': timestamp,
      'x-cp-signature': dbCrypto.hashWithPepper(`${timestamp}.${text}`, sign.secret ?? SECRET),
    },
    body: text,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function mailFor(messageId: string) {
  const { rows } = await harness.pool.query<{
    id: string;
    status: string;
    quarantine_reason: string | null;
    user_id: string | null;
  }>(
    'SELECT id, status, quarantine_reason, user_id FROM inbound_emails WHERE message_id_hash = $1',
    [dbCrypto.hashWithPepper(`message:${messageId}`, PEPPER)],
  );
  return rows[0];
}

async function parseJobs(): Promise<number> {
  const { rows } = await harness.pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'mail.parse'",
  );
  return rows[0]!.n;
}

const codeOf = (text: unknown) => /\b(\d{6})\b/u.exec(String(text))?.[1];

/** The Worker's report on a link-code reply. */
const delivered = (linkId: unknown, delivery: 'sent' | 'failed', sign: { secret?: string } = {}) =>
  post({ link_id: linkId, delivery }, { ...sign, path: '/webhooks/inbound-email/reply' });

/** What a crew member's app reads on the crew's address row. */
async function held() {
  const maya = crew.members[1] as SignedIn;
  return withUser(harness.pool, maya.uid, 'test', async (tx) => {
    const { rows } = await tx.query<{
      held_count: number;
      held: boolean;
      held_code_until: Date | null;
    }>(
      `SELECT held_count, held_at IS NOT NULL AS held, held_code_until FROM crew_inbound_addresses
        WHERE crew_id = $1 AND status = 'active'`,
      [crew.crewId],
    );
    return rows[0];
  });
}

async function senderLink(linkId: unknown) {
  const { rows } = await harness.pool.query<{
    code_delivery: string | null;
    code_expires_at: Date | null;
    has_code: boolean;
  }>(
    `SELECT code_delivery, code_expires_at, code_hash IS NOT NULL AS has_code
       FROM inbound_sender_links WHERE id = $1`,
    [linkId],
  );
  return rows[0];
}

describe('the webhook signature', () => {
  it('refuses a wrong secret and a stale timestamp', async () => {
    expect((await post(report('maya@example.com'), { secret: 'x'.repeat(40) })).status).toBe(403);
    const stale = Math.floor(Date.now() / 1000) - 3_600;
    expect((await post(report('maya@example.com'), { timestamp: stale })).status).toBe(403);
  });
});

describe('the sender allow-list', () => {
  it("accepts a member's verified email and queues it for parsing", async () => {
    const [, maya] = crew.members as [SignedIn, SignedIn];
    const before = await parseJobs();
    const mail = report('Maya Tan <Maya@Example.com>');
    expect((await post(mail)).body).toEqual({ action: 'accepted' });
    expect(await mailFor(mail.message_id)).toMatchObject({ status: 'accepted', user_id: maya.uid });
    expect(await parseJobs()).toBe(before + 1);
  });

  it("accepts a member's Apple private relay address", async () => {
    const [, , alex] = crew.members as [SignedIn, SignedIn, SignedIn];
    const mail = report('k7x2@privaterelay.appleid.com');
    expect((await post(mail)).body).toEqual({ action: 'accepted' });
    expect((await mailFor(mail.message_id))?.user_id).toBe(alex.uid);
  });

  it('keeps mail that fails sender authentication, without a reply', async () => {
    const mail = report('maya@example.com', { dkim: 'fail', spf: 'softfail' });
    expect((await post(mail)).body).toEqual({ action: 'quarantined' });
    expect(await mailFor(mail.message_id)).toMatchObject({ quarantine_reason: 'auth_failed' });
  });

  it('treats a repeated Message-ID as a duplicate', async () => {
    const mail = report('maya@example.com');
    await post(mail);
    expect((await post(mail)).body).toEqual({ action: 'duplicate' });
  });
});

describe('linking an unknown sender', () => {
  let code: string | undefined;
  let linkId: unknown;
  let first: ReturnType<typeof report>;

  it('quarantines the mail and replies with one code', async () => {
    first = report('bookings@partner.example');
    const second = report('bookings@partner.example');
    const answer = await post(first);
    expect(answer.body['action']).toBe('quarantined');
    const reply = answer.body['reply'] as { text: string; link_id: string };
    code = codeOf(reply.text);
    linkId = reply.link_id;
    expect(code).toMatch(/^\d{6}$/u);
    const again = await post(second);
    expect(again.body).toEqual({ action: 'quarantined' });
    expect(await mailFor(first.message_id)).toMatchObject({
      status: 'quarantined',
      quarantine_reason: 'unknown_sender',
    });
    // The crew sees that mail is waiting, and nothing about it; no code is asked for until the
    // Worker says the reply went out.
    expect(await held()).toEqual({ held_count: 2, held: true, held_code_until: null });
    expect((await senderLink(linkId))?.code_delivery).toBe('pending');
  });

  it('asks the crew for the code once the Worker reports the reply sent', async () => {
    expect((await delivered(linkId, 'sent', { secret: 'x'.repeat(40) })).status).toBe(403);
    expect((await delivered(linkId, 'sent')).body).toEqual({ recorded: true });
    const link = await senderLink(linkId);
    expect(link).toMatchObject({ code_delivery: 'sent', has_code: true });
    expect(await held()).toEqual({
      held_count: 2,
      held: true,
      held_code_until: link?.code_expires_at,
    });
    // A repeated or late report changes nothing.
    expect((await delivered(linkId, 'failed')).body).toEqual({ recorded: false });
    expect((await senderLink(linkId))?.has_code).toBe(true);
  });

  it('refuses a wrong code, and links and releases the mail with the right one', async () => {
    const [organiser] = crew.members as [SignedIn];
    const wrong = await harness.run(organiser, 'verify_sender_email', {
      crew_id: crew.crewId,
      code: code === '000000' ? '111111' : '000000',
    });
    expect(errorOf(wrong).code).toBe('CODE_INVALID');
    const before = await parseJobs();
    const right = await harness.run(organiser, 'verify_sender_email', {
      crew_id: crew.crewId,
      code,
    });
    expect(resultOf(right)).toEqual({ crew_id: crew.crewId, released: 2 });
    expect(await mailFor(first.message_id)).toMatchObject({
      status: 'accepted',
      user_id: organiser.uid,
    });
    expect(await parseJobs()).toBe(before + 2);
    expect(await held()).toEqual({ held_count: 0, held: false, held_code_until: null });
    const later = report('bookings@partner.example');
    expect((await post(later)).body).toEqual({ action: 'accepted' });
  });
});

describe('a link-code reply Cloudflare refused', () => {
  it('clears the code, tells the crew none went out, and tries again on the next forward', async () => {
    const answer = await post(report('tickets@carrier.example'));
    const reply = answer.body['reply'] as { text: string; link_id: string };
    expect((await delivered(reply.link_id, 'failed')).body).toEqual({ recorded: true });
    expect(await senderLink(reply.link_id)).toEqual({
      code_delivery: 'failed',
      code_expires_at: null,
      has_code: false,
    });
    expect(await held()).toEqual({ held_count: 1, held: true, held_code_until: null });
    const [, maya] = crew.members as [SignedIn, SignedIn];
    const stale = await harness.run(maya, 'verify_sender_email', {
      crew_id: crew.crewId,
      code: codeOf(reply.text),
    });
    expect(errorOf(stale).code).toBe('CODE_INVALID');
    // No ten-minute wait after a refused reply: the next forward gets a new code and a new try.
    const again = await post(report('tickets@carrier.example'));
    const retry = again.body['reply'] as { link_id: string } | undefined;
    expect(retry?.link_id).toBe(reply.link_id);
    expect((await senderLink(reply.link_id))?.code_delivery).toBe('pending');
  });
});

describe('rotating the address', () => {
  it('is the organiser’s, and the old address is refused afterwards', async () => {
    const [organiser, maya] = crew.members as [SignedIn, SignedIn];
    const refused = await harness.run(maya, 'rotate_inbound_address', { crew_id: crew.crewId });
    expect(errorOf(refused).code).toBe('FORBIDDEN');
    const rotated = await harness.run(organiser, 'rotate_inbound_address', {
      crew_id: crew.crewId,
    });
    const fresh = resultOf<{ local_part: string }>(rotated).local_part;
    expect(fresh).not.toBe(localPart);
    expect((await post(report('maya@example.com'))).body).toEqual({
      action: 'rejected',
      reason: 'unknown_address',
    });
    const retired = await withSystem(harness.pool, (tx) =>
      tx.query(
        "SELECT 1 FROM crew_inbound_addresses WHERE local_part = $1 AND status = 'retired'",
        [localPart],
      ),
    );
    expect(retired.rowCount).toBe(1);
  });
});
