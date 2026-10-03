/**
 * From a confirmation's content to import candidates, shared by every import channel (forwarded
 * mail, paste, scan, mailbox):
 * 1. schema.org JSON-LD, then microdata: when the markup names the bookings, no model is called;
 * 2. otherwise the sanitised text is screened for injected instructions (a flagged or unscreened
 *    text makes the candidate need the user's own confirm) and read by the fast tier, whose answer
 *    is checked against the text;
 * 3. each booking becomes a candidate under its dedupe key: a copy of one already proposed (or
 *    already in the wallet) is kept as a `duplicate` for its sender only, never shown twice.
 */
import type { ComplianceOutcome } from '@cp/domain';
import {
  BOOKINGS_RT,
  bookingsFromJsonLd,
  bookingsFromMicrodata,
  channelName,
  dedupeKey,
  generateUuidV7,
  duplicateDedupeKey,
  extractJsonLd,
  extractMicrodata,
  htmlToText,
  normaliseText,
  type BookingSupplier,
  type DedupeScope,
  type ExtractedBooking,
  type ImportSource,
} from '@cp/domain';
import { appendDomainEvent, outbox } from '@cp/db';
import { extractBookings, type Gateway } from '@cp/ai';
import type pg from 'pg';

export interface ConfirmationContent {
  readonly html: string | null;
  readonly text: string | null;
  readonly subject?: string | undefined;
  readonly supplier: BookingSupplier | null;
  readonly defaultTz: string | null;
  readonly source: ImportSource;
}

export interface ReaderDeps {
  /** The fast tier through the gateway; absent without a model key (imports then fail over). */
  readonly gateway?: Pick<Gateway, 'callModel'> | undefined;
  /** The `imported_text` compliance screen; absent = unscreened (treated as needing a confirm). */
  readonly screen?: ((text: string) => Promise<ComplianceOutcome>) | undefined;
  readonly exponentOf: (currency: string) => number | undefined;
}

export type ReadResult =
  | {
      readonly status: 'parsed';
      readonly bookings: ExtractedBooking[];
      readonly needsConfirm: boolean;
      readonly via: 'markup' | 'model';
    }
  | {
      readonly status: 'failed';
      readonly reason:
        'unreadable' | 'no_booking' | 'empty' | 'unsupported_attachment' | 'flight_not_found';
    };

export async function readConfirmation(
  content: ConfirmationContent,
  deps: ReaderDeps,
): Promise<ReadResult> {
  const markupOptions = {
    defaultTz: content.defaultTz,
    exponentOf: deps.exponentOf,
    supplier: content.supplier ?? 'other',
  };
  if (content.html !== null) {
    const fromJsonLd = bookingsFromJsonLd(extractJsonLd(content.html), markupOptions);
    if (fromJsonLd.length > 0)
      return { status: 'parsed', bookings: fromJsonLd, needsConfirm: false, via: 'markup' };
    const fromMicrodata = bookingsFromMicrodata(extractMicrodata(content.html), markupOptions);
    if (fromMicrodata.length > 0) {
      return { status: 'parsed', bookings: fromMicrodata, needsConfirm: false, via: 'markup' };
    }
  }
  const text =
    content.html !== null && content.html.trim() !== ''
      ? htmlToText(content.html)
      : normaliseText(content.text ?? '');
  if (text === '') return { status: 'failed', reason: 'empty' };
  if (deps.gateway === undefined) return { status: 'failed', reason: 'unreadable' };
  const screened = deps.screen === undefined ? 'review' : await deps.screen(text);
  const result = await extractBookings(deps.gateway, {
    text,
    source: content.source,
    subject: content.subject,
    supplier: content.supplier,
    exponentOf: deps.exponentOf,
  });
  if (result.status === 'failed') return result;
  return {
    status: 'parsed',
    bookings: result.bookings,
    needsConfirm: screened !== 'pass',
    via: 'model',
  };
}

/** The crew trip a booking belongs to: the one its start falls in, else the crew's only live one. */
export async function tripForBooking(
  tx: pg.PoolClient,
  crewId: string,
  startsAt: string | null,
): Promise<string | null> {
  const { rows } = await tx.query<{ id: string; fits: boolean }>(
    `SELECT t.id,
            ($2::timestamptz IS NOT NULL AND t.start_date IS NOT NULL AND t.end_date IS NOT NULL
             AND ($2::timestamptz AT TIME ZONE coalesce(t.tz, d.tz, 'UTC'))::date
                 BETWEEN t.start_date - 2 AND t.end_date + 1) AS fits
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.crew_id = $1 AND t.status NOT IN ('archived', 'cancelled')
      ORDER BY fits DESC, t.start_date NULLS LAST, t.created_at`,
    [crewId, startsAt],
  );
  const fitting = rows.find((row) => row.fits);
  if (fitting !== undefined) return fitting.id;
  return rows.length === 1 ? (rows[0]?.id ?? null) : null;
}

export interface CandidateTarget {
  readonly userId: string;
  readonly crewId: string | null;
  readonly tripId: string | null;
  readonly source: ImportSource;
  readonly scope: DedupeScope;
  readonly crewVisible: boolean;
  readonly inboundEmailId?: string | null;
  /** The client's id for the first candidate (paste and scan create it `parsing`). */
  readonly candidateId?: string | undefined;
  /** A wallet booking this is known to be a copy of (a boarding pass for a flight already added). */
  readonly knownBookingId?: string | undefined;
}

async function walletCopy(
  tx: pg.PoolClient,
  target: CandidateTarget,
  booking: ExtractedBooking,
): Promise<string | null> {
  if (booking.supplier_ref === null || target.crewId === null) return null;
  const { rows } = await tx.query<{ id: string }>(
    `SELECT b.id FROM bookings b JOIN trips t ON t.id = b.trip_id
      WHERE t.crew_id = $1 AND b.deleted_at IS NULL AND b.supplier = $2
        AND lower(b.supplier_ref) = lower($3)
        AND (b.visibility = 'crew' OR b.owner_id = $4)
      LIMIT 1`,
    [target.crewId, booking.supplier, booking.supplier_ref, target.userId],
  );
  return rows[0]?.id ?? null;
}

/** Writes (or fills in) one candidate per booking; returns the new and the duplicate ids. */
export async function writeCandidates(
  tx: pg.PoolClient,
  target: CandidateTarget,
  bookings: readonly ExtractedBooking[],
  needsConfirm: boolean,
): Promise<{ created: string[]; duplicates: string[] }> {
  const created: string[] = [];
  const duplicates: string[] = [];
  for (const [index, booking] of bookings.entries()) {
    const id = (index === 0 ? target.candidateId : undefined) ?? generateUuidV7();
    const tripId =
      target.tripId ??
      (target.crewId === null ? null : await tripForBooking(tx, target.crewId, booking.starts_at));
    const key = dedupeKey(target.scope, booking);
    const inWallet = target.knownBookingId ?? (await walletCopy(tx, target, booking));
    const fields = {
      user_id: target.userId,
      crew_id: target.crewId,
      trip_id: tripId,
      source: target.source,
      extracted: JSON.stringify(booking),
      confidence: booking.extracted_by === 'model' ? 0.8 : 1,
      needs_confirm: needsConfirm,
      inbound_email_id: target.inboundEmailId ?? null,
      failure_reason: null,
    };
    // The first writer of a key owns it (a racing copy waits, then finds it taken).
    const owned =
      inWallet === null &&
      (await upsertCandidate(
        tx,
        id,
        { ...fields, dedupe_key: key, status: 'pending', crew_visible: target.crewVisible },
        true,
      ));
    if (!owned) {
      const { rows } = await tx.query<{ id: string }>(
        'SELECT id FROM import_candidates WHERE dedupe_key = $1',
        [key],
      );
      await upsertCandidate(
        tx,
        id,
        {
          ...fields,
          dedupe_key: duplicateDedupeKey(id),
          status: 'duplicate',
          crew_visible: false,
          duplicate_of_id: rows[0]?.id ?? null,
          booking_id: inWallet,
        },
        false,
      );
    }
    (owned ? created : duplicates).push(id);
    await announce(tx, target, id, tripId, owned ? 'pending' : 'duplicate');
  }
  return { created, duplicates };
}

/**
 * Inserts the candidate, or fills in the client's `parsing` row. With `claimKey`, nothing is
 * written when another candidate already holds the key, and the answer says whether it was.
 */
async function upsertCandidate(
  tx: pg.PoolClient,
  id: string,
  fields: Readonly<Record<string, unknown>>,
  claimKey: boolean,
): Promise<boolean> {
  const columns = Object.keys(fields);
  const values = Object.values(fields);
  const guard = claimKey
    ? `AND NOT EXISTS (SELECT 1 FROM import_candidates o WHERE o.dedupe_key = $${columns.length + 2} AND o.id <> $1)`
    : '';
  const updated = await tx.query(
    `UPDATE import_candidates SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')}
     WHERE id = $1 ${guard}`,
    claimKey ? [id, ...values, fields['dedupe_key']] : [id, ...values],
  );
  if ((updated.rowCount ?? 0) > 0) return true;
  const exists = await tx.query('SELECT 1 FROM import_candidates WHERE id = $1', [id]);
  if ((exists.rowCount ?? 0) > 0) return false;
  const inserted = await tx.query(
    `INSERT INTO import_candidates (id, ${columns.join(', ')})
     VALUES ($1, ${columns.map((_, i) => `$${i + 2}`).join(', ')})
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [id, ...values],
  );
  return (inserted.rowCount ?? 0) > 0;
}

/** A candidate that could not be read: the app offers "add it by hand". */
export async function writeFailedCandidate(
  tx: pg.PoolClient,
  target: CandidateTarget,
  reason:
    | 'unreadable'
    | 'no_booking'
    | 'empty'
    | 'unsupported_attachment'
    | 'fetch_failed'
    | 'blocked_url'
    | 'flight_not_found',
): Promise<string> {
  const id = target.candidateId ?? generateUuidV7();
  await upsertCandidate(
    tx,
    id,
    {
      user_id: target.userId,
      crew_id: target.crewId,
      trip_id: target.tripId,
      source: target.source,
      dedupe_key: `failed:${id}`,
      status: 'failed',
      failure_reason: reason,
      inbound_email_id: target.inboundEmailId ?? null,
    },
    false,
  );
  await announce(tx, target, id, target.tripId, 'failed');
  return id;
}

async function announce(
  tx: pg.PoolClient,
  target: CandidateTarget,
  candidateId: string,
  tripId: string | null,
  status: 'pending' | 'duplicate' | 'failed',
): Promise<void> {
  await appendDomainEvent(tx, {
    type: 'import.candidate_created',
    aggregateKind: 'import_candidate',
    aggregateId: candidateId,
    actorKind: 'system',
    actorId: null,
    crewId: target.crewId,
    tripId,
    payload: {
      candidate_id: candidateId,
      user_id: target.userId,
      crew_id: target.crewId,
      trip_id: tripId,
      source: target.source,
      status,
    },
  });
  if (target.crewVisible && target.crewId !== null && status === 'pending') {
    await outbox(tx, channelName('crew_bookings', target.crewId), BOOKINGS_RT.importCandidate, {
      candidate_id: candidateId,
    });
  } else {
    await outbox(tx, channelName('user', target.userId), BOOKINGS_RT.importCandidate, {
      candidate_id: candidateId,
      status,
    });
  }
}
