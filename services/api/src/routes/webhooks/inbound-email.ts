/**
 * `POST /webhooks/inbound-email` (docs/api-contracts.md §5.8): the Email Worker's signed report of
 * one message at a crew address (infra/cloudflare/inbound-email). The signature is HMAC-SHA256 over
 * `{timestamp}.{body}` with the shared secret, and the timestamp must be within five minutes.
 *
 * The answer tells the Worker what to do:
 * - `rejected` (the address is unknown or retired): bounce with the reason;
 * - `duplicate` (the same Message-ID already reached this address): drop it;
 * - `accepted`: a crew member sent it (their verified email, Apple relay or a linked address) with a
 *   passing DKIM or SPF verdict; `mail.parse` is queued;
 * - `quarantined`: failed sender authentication (kept, no reply), or an unknown sender, who gets the
 *   "Link this email?" reply with a 6-digit code (at most one live code per sender and crew, a new
 *   one no sooner than ten minutes after the last) while the crew sees that mail is waiting.
 * Sender addresses and Message-IDs are stored only as peppered hashes; the body never reaches here.
 */
import { randomInt } from 'node:crypto';

import { crypto as dbCrypto, emitEvent, outbox, sendInTx, withSystem } from '@cp/db';
import {
  BOOKINGS_QUEUES,
  BOOKINGS_RT,
  channelName,
  DomainError,
  LINK_EMAIL_REPLY,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../../app';
import { refreshHeldMail } from '../../bookings/held-mail';
import {
  normalizeSender,
  resolveSender,
  senderHash,
  type AccountLookup,
} from '../../bookings/sender-allow-list';

export const SIGNATURE_WINDOW_SECONDS = 300;
export const LINK_CODE_TTL_HOURS = 24;
/** A fresh code (and reply) no sooner than this after the last one for the same sender and crew. */
export const LINK_REPLY_INTERVAL_MINUTES = 10;

export interface InboundEmailDeps {
  readonly pool: pg.Pool;
  readonly secret: string;
  readonly pepper: string;
  readonly lookup: AccountLookup;
  readonly now?: () => Date;
}

const reportSchema = z.object({
  local_part: z.string().min(1).max(64),
  from: z.string().min(3).max(320),
  message_id: z.string().min(1).max(998),
  subject_present: z.boolean().optional(),
  size_bytes: z.int().min(0).max(26_214_400),
  r2_key: z.string().regex(/^inbound\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9-]{1,64}\.eml$/u),
  dkim: z.enum(['pass', 'fail', 'none']),
  spf: z.enum(['pass', 'fail', 'softfail', 'neutral', 'none']),
  received_at: z.iso.datetime({ offset: true }),
});
type InboundReport = z.infer<typeof reportSchema>;

export type InboundAnswer =
  | { readonly action: 'rejected'; readonly reason: 'unknown_address' | 'bad_sender' }
  | { readonly action: 'duplicate' | 'accepted' }
  | {
      readonly action: 'quarantined';
      readonly reply?: { readonly subject: string; readonly text: string };
    };

/** Constant-time check of the Worker's signature and a timestamp within the window. */
export function verifySignature(
  secret: string,
  timestamp: string | undefined,
  signature: string | undefined,
  body: string,
  now: Date,
): boolean {
  if (timestamp === undefined || signature === undefined || !/^\d{1,12}$/u.test(timestamp)) {
    return false;
  }
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > SIGNATURE_WINDOW_SECONDS) return false;
  const expected = dbCrypto.hashWithPepper(`${timestamp}.${body}`, secret);
  return /^[0-9a-f]{64}$/u.test(signature) && dbCrypto.hashesMatch(expected, signature);
}

export function linkCodeHash(crewId: string, code: string, pepper: string): string {
  return dbCrypto.hashWithPepper(`link-code:${crewId}:${code}`, pepper);
}

async function insertMail(
  tx: pg.PoolClient,
  row: {
    addressId: string;
    crewId: string;
    userId: string | null;
    senderHash: string;
    messageIdHash: string;
    report: InboundReport;
    status: 'accepted' | 'quarantined';
    reason: 'unknown_sender' | 'auth_failed' | null;
  },
): Promise<string | null> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO inbound_emails (address_id, crew_id, user_id, sender_hash, message_id_hash, r2_key,
       size_bytes, dkim, spf, status, quarantine_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (address_id, message_id_hash) DO NOTHING RETURNING id`,
    [
      row.addressId,
      row.crewId,
      row.userId,
      row.senderHash,
      row.messageIdHash,
      row.report.r2_key,
      row.report.size_bytes,
      row.report.dkim,
      row.report.spf,
      row.status,
      row.reason,
    ],
  );
  return rows[0]?.id ?? null;
}

/** Issues a link code for an unknown sender unless one went out in the last ten minutes. */
async function issueLinkCode(
  tx: pg.PoolClient,
  crewId: string,
  hash: string,
  pepper: string,
  now: Date,
): Promise<string | null> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expires = new Date(now.getTime() + LINK_CODE_TTL_HOURS * 3_600_000);
  const recentAfter = new Date(expires.getTime() - LINK_REPLY_INTERVAL_MINUTES * 60_000);
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO inbound_sender_links (crew_id, sender_hash, code_hash, code_expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (crew_id, sender_hash) DO UPDATE
       SET code_hash = EXCLUDED.code_hash, code_expires_at = EXCLUDED.code_expires_at,
           attempts = 0, user_id = NULL, verified_at = NULL
       WHERE inbound_sender_links.code_expires_at IS NULL
          OR inbound_sender_links.code_expires_at < $5
     RETURNING id`,
    [crewId, hash, linkCodeHash(crewId, code, pepper), expires, recentAfter],
  );
  return rows.length === 0 ? null : code;
}

export async function receiveInboundEmail(
  deps: InboundEmailDeps,
  report: InboundReport,
  now: Date,
): Promise<InboundAnswer> {
  const address = normalizeSender(report.from);
  return withSystem(deps.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string; crew_id: string; crew_name: string }>(
      `SELECT a.id, a.crew_id, c.name AS crew_name FROM crew_inbound_addresses a
         JOIN crews c ON c.id = a.crew_id
        WHERE a.local_part = $1 AND a.status = 'active'`,
      [report.local_part.toLowerCase()],
    );
    const target = rows[0];
    if (target === undefined) return { action: 'rejected', reason: 'unknown_address' };
    if (address === null) return { action: 'rejected', reason: 'bad_sender' };
    const hash = senderHash(address, deps.pepper);
    const base = {
      addressId: target.id,
      crewId: target.crew_id,
      senderHash: hash,
      messageIdHash: dbCrypto.hashWithPepper(`message:${report.message_id}`, deps.pepper),
      report,
    };
    if (report.dkim !== 'pass' && report.spf !== 'pass') {
      const id = await insertMail(tx, {
        ...base,
        userId: null,
        status: 'quarantined',
        reason: 'auth_failed',
      });
      return id === null ? { action: 'duplicate' } : { action: 'quarantined' };
    }
    const sender = await resolveSender(tx, { address, crewId: target.crew_id, hash }, deps.lookup);
    if (sender.kind === 'member') {
      const id = await insertMail(tx, {
        ...base,
        userId: sender.uid,
        status: 'accepted',
        reason: null,
      });
      if (id === null) return { action: 'duplicate' };
      await sendInTx(tx, BOOKINGS_QUEUES.mailParse, { inbound_email_id: id }, { singletonKey: id });
      return { action: 'accepted' };
    }
    const id = await insertMail(tx, {
      ...base,
      userId: null,
      status: 'quarantined',
      reason: 'unknown_sender',
    });
    if (id === null) return { action: 'duplicate' };
    await refreshHeldMail(tx, target.crew_id);
    await emitEvent(tx, {
      type: 'import.quarantined',
      aggregateKind: 'inbound_email',
      aggregateId: id,
      actorKind: 'system',
      actorId: null,
      crewId: target.crew_id,
      payload: { crew_id: target.crew_id, inbound_email_id: id },
    });
    await outbox(tx, channelName('crew_bookings', target.crew_id), BOOKINGS_RT.importQuarantined, {
      crew_id: target.crew_id,
    });
    const code = await issueLinkCode(tx, target.crew_id, hash, deps.pepper, now);
    if (code === null) return { action: 'quarantined' };
    return {
      action: 'quarantined',
      reply: {
        subject: LINK_EMAIL_REPLY.subject.message,
        text: LINK_EMAIL_REPLY.body.message
          .replace('{crew}', target.crew_name)
          .replace('{code}', code),
      },
    };
  });
}

export function registerInboundEmailWebhook(
  app: OpenAPIHono<AppEnv>,
  deps: InboundEmailDeps,
): void {
  app.post('/webhooks/inbound-email', async (c) => {
    const body = await c.req.text();
    const now = deps.now?.() ?? new Date();
    if (
      !verifySignature(
        deps.secret,
        c.req.header('x-cp-timestamp'),
        c.req.header('x-cp-signature'),
        body,
        now,
      )
    ) {
      throw new DomainError('FORBIDDEN', { reason: 'bad_signature' });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new DomainError('VALIDATION', { reason: 'not_json' });
    }
    const report = reportSchema.safeParse(parsed);
    if (!report.success) throw new DomainError('VALIDATION', { reason: 'bad_report' });
    return c.json(await receiveInboundEmail(deps, report.data, now));
  });
}
