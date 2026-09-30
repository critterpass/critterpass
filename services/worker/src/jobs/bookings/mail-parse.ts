/**
 * `mail.parse` (docs/api-contracts-async.md §2.2): an accepted forward to a crew address becomes
 * import candidates the whole crew can ADD or IGNORE. The raw message is read back from R2 and
 * decoded (MIME, charsets, the forwarded original inside it); the seller is named from the first
 * known booking domain in it; then the shared reader runs (markup first, the screened model read
 * otherwise). Mail that cannot be read leaves a failed candidate for its sender ("add it by hand");
 * a message with only attachments the reader cannot open says so.
 */
import { withSystem } from '@cp/db';
import {
  BOOKINGS_QUEUES,
  BOOKING_SENDER_DOMAINS,
  supplierOfSender,
  type BookingSupplier,
} from '@cp/domain';
import type pg from 'pg';
import PostalMime from 'postal-mime';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import {
  readConfirmation,
  writeCandidates,
  writeFailedCandidate,
  type ReaderDeps,
} from './candidates';

export interface RawMailStore {
  get(key: string): Promise<{ readonly bytes: Uint8Array } | null>;
}

export interface MailParseDeps extends ReaderDeps {
  readonly store: RawMailStore | undefined;
}

interface InboundRow {
  readonly crew_id: string;
  readonly user_id: string;
  readonly r2_key: string | null;
  readonly status: string;
}

export interface DecodedMail {
  readonly html: string | null;
  readonly text: string | null;
  readonly subject: string | undefined;
  readonly supplier: BookingSupplier | null;
  readonly onlyAttachments: boolean;
}

/** The seller: the first known booking domain named anywhere in the forwarded headers or body. */
export function supplierIn(text: string): BookingSupplier | null {
  const mentions = text.toLowerCase().matchAll(/@([a-z0-9.-]+\.[a-z]{2,})/gu);
  for (const mention of mentions) {
    const supplier = supplierOfSender(`x@${mention[1] ?? ''}`);
    if (supplier !== null) return supplier;
  }
  const bare = Object.keys(BOOKING_SENDER_DOMAINS).find((domain) =>
    text.toLowerCase().includes(domain),
  );
  return bare === undefined ? null : (BOOKING_SENDER_DOMAINS[bare] ?? null);
}

/** MIME-decodes a raw message (a forwarded `message/rfc822` original wins over the wrapper). */
export async function decodeMail(raw: Uint8Array): Promise<DecodedMail> {
  const outer = await PostalMime.parse(raw);
  const forwarded = outer.attachments.find((part) => part.mimeType === 'message/rfc822');
  const mail =
    forwarded === undefined
      ? outer
      : await PostalMime.parse(
          typeof forwarded.content === 'string'
            ? forwarded.content
            : new Uint8Array(forwarded.content),
        );
  const html = mail.html ?? null;
  const text = mail.text ?? null;
  const sender = mail.from?.address ?? null;
  const supplier =
    (sender === null ? null : supplierOfSender(sender)) ??
    supplierIn(`${html ?? ''}\n${text ?? ''}`);
  return {
    html,
    text,
    subject: mail.subject,
    supplier,
    onlyAttachments:
      (html ?? '').trim() === '' && (text ?? '').trim() === '' && mail.attachments.length > 0,
  };
}

export type MailParseOutcome = 'parsed' | 'failed' | 'gone';

export async function parseInboundEmail(
  pool: pg.Pool,
  deps: MailParseDeps,
  inboundEmailId: string,
): Promise<MailParseOutcome> {
  const row = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<InboundRow>(
      'SELECT crew_id, user_id, r2_key, status FROM inbound_emails WHERE id = $1',
      [inboundEmailId],
    );
    return rows[0];
  });
  if (row?.status !== 'accepted' || row.user_id === null) return 'gone';
  const target = {
    userId: row.user_id,
    crewId: row.crew_id,
    tripId: null,
    source: 'forward' as const,
    scope: { kind: 'crew' as const, id: row.crew_id },
    crewVisible: true,
    inboundEmailId,
  };
  const raw =
    row.r2_key === null || deps.store === undefined ? null : await deps.store.get(row.r2_key);
  const decoded = raw === null ? null : await decodeMail(raw.bytes);
  const tz = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ tz: string | null }>(
      `SELECT coalesce(t.tz, d.tz) AS tz FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE t.crew_id = $1 AND t.status NOT IN ('archived', 'cancelled')
        ORDER BY t.start_date NULLS LAST LIMIT 1`,
      [row.crew_id],
    );
    return rows[0]?.tz ?? null;
  });
  const read =
    decoded === null
      ? ({ status: 'failed', reason: 'unreadable' } as const)
      : decoded.onlyAttachments
        ? ({ status: 'failed', reason: 'unsupported_attachment' } as const)
        : await readConfirmation(
            {
              html: decoded.html,
              text: decoded.text,
              subject: decoded.subject,
              supplier: decoded.supplier,
              defaultTz: tz,
              source: 'forward',
            },
            deps,
          );
  return withSystem(pool, async (tx) => {
    const current = await tx.query<{ status: string }>(
      'SELECT status FROM inbound_emails WHERE id = $1 FOR UPDATE',
      [inboundEmailId],
    );
    if (current.rows[0]?.status !== 'accepted') return 'gone';
    if (read.status === 'failed') {
      await writeFailedCandidate(tx, target, read.reason);
      await tx.query("UPDATE inbound_emails SET status = 'failed' WHERE id = $1", [inboundEmailId]);
      return 'failed';
    }
    await writeCandidates(tx, target, read.bookings, read.needsConfirm);
    await tx.query("UPDATE inbound_emails SET status = 'parsed' WHERE id = $1", [inboundEmailId]);
    return 'parsed';
  });
}

const mailParseJobSchema = z.object({ inbound_email_id: z.uuid() });

export function mailParseJob(
  deps: MailParseDeps,
): JobDefinition<z.infer<typeof mailParseJobSchema>> {
  return defineJob({
    queue: BOOKINGS_QUEUES.mailParse,
    schema: mailParseJobSchema,
    singletonKey: (data) => data.inbound_email_id,
    handler: async (data, ctx) => ({
      outcome: await parseInboundEmail(ctx.pool, deps, data.inbound_email_id),
    }),
  });
}
