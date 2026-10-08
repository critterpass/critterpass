/**
 * `import.parse` (docs/api-contracts-async.md §2.2): a paste or a scan the user sent becomes their
 * own candidates. A pasted link on the supplier allow-list is fetched once (./safe-fetch.ts) and
 * read like an email; any other link, a code or free text is read as text. A scan's boarding pass
 * barcode (IATA BCBP) is decoded and joined to the flight its text describes; a pass for a flight
 * already in the traveller's wallet is proposed as that booking's barcode and seat. A paste that is
 * only a flight number (with or without a date) is looked up in the flight's published schedule
 * (./flight-number-paste.ts); with nothing found, or no date to look on, the candidate asks for
 * the date and route.
 */
import { withSystem } from '@cp/db';
import {
  BOOKINGS_QUEUES,
  decodeBcbp,
  emptyExtraction,
  flightDate,
  importParseJobSchema,
  mergeBoardingPass,
  supplierOfSender,
  type BcbpPass,
  type ExtractedBooking,
  type ImportParseJob,
} from '@cp/domain';
import type { FlightSnapshot } from '@cp/suppliers';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import {
  readConfirmation,
  writeCandidates,
  writeFailedCandidate,
  type ReadResult,
  type ReaderDeps,
} from './candidates';
import {
  flightExtraction,
  lookupWindow,
  pickFlight,
  readPastedFlight,
} from './flight-number-paste';
import { isAllowListed, safeFetch, type SafeFetchDeps } from './safe-fetch';
import { failUnreadableImport } from './unreadable-import';

/** Flights with a number departing between two local dates; `[]` when the budget is spent. */
export type FlightScheduleLookup = (
  carrier: string,
  number: string,
  from: string,
  to: string,
) => Promise<FlightSnapshot[]>;

export interface ImportParseDeps extends ReaderDeps {
  readonly fetch: SafeFetchDeps;
  readonly now?: () => Date;
  /** Absent without a flight schedule provider: a pasted flight number then asks for the route. */
  readonly schedule?: FlightScheduleLookup | undefined;
}

interface CandidateRow {
  readonly user_id: string;
  readonly crew_id: string | null;
  readonly trip_id: string | null;
  readonly tz: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly home_airport: string | null;
}

/** A paste that is only a flight number: its schedule as one booking, or null when not found. */
async function scheduledFlight(
  deps: ImportParseDeps,
  candidate: CandidateRow,
  text: string,
  now: Date,
): Promise<ReadResult | 'not_flight'> {
  const tz = candidate.tz ?? 'UTC';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
  const pasted = readPastedFlight(text, candidate.start_date ?? today);
  if (pasted === null) return 'not_flight';
  const window = lookupWindow(pasted, { start: candidate.start_date, end: candidate.end_date });
  if (window === null || deps.schedule === undefined) {
    return { status: 'failed', reason: 'flight_not_found' };
  }
  const found = await deps.schedule(pasted.carrier, pasted.number, window.from, window.to);
  const home = candidate.home_airport?.toUpperCase() ?? null;
  const flight = pickFlight(found, pasted, { window, home, tz });
  if (flight === null) return { status: 'failed', reason: 'flight_not_found' };
  return {
    status: 'parsed',
    bookings: [flightExtraction(flight, tz)],
    needsConfirm: false,
    via: 'markup',
  };
}

function decodePass(job: ImportParseJob): BcbpPass | null {
  if (job.barcode === undefined || !['pdf417', 'aztec', 'qr'].includes(job.barcode.format))
    return null;
  try {
    return decodeBcbp(job.barcode.payload);
  } catch {
    return null;
  }
}

/** The traveller's own wallet flight a pass leg belongs to, as a flight extraction to attach to. */
async function walletFlight(
  pool: pg.Pool,
  uid: string,
  pass: BcbpPass,
  readOn: Date,
): Promise<{ bookingId: string; booking: ExtractedBooking } | null> {
  for (const leg of pass.legs) {
    const day = flightDate(leg.julianDate, readOn);
    const found = await withSystem(pool, async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        title: string;
        supplier: ExtractedBooking['supplier'];
        supplier_ref: string | null;
        dep_airport: string;
        arr_airport: string;
        sched_dep_at: Date;
      }>(
        `SELECT b.id, b.title, b.supplier, b.supplier_ref, s.dep_airport, s.arr_airport, s.sched_dep_at
           FROM flight_segments s JOIN bookings b ON b.id = s.booking_id
          WHERE b.owner_id = $1 AND b.deleted_at IS NULL AND s.carrier = $2 AND s.flight_no = $3
            AND s.sched_dep_at BETWEEN $4::date - 1 AND $4::date + 2
          LIMIT 1`,
        [uid, leg.carrier, leg.flightNumber, day],
      );
      return rows[0];
    });
    if (found !== undefined) {
      return {
        bookingId: found.id,
        booking: {
          ...emptyExtraction('flight', found.title, 'bcbp'),
          supplier: found.supplier,
          supplier_ref: found.supplier_ref ?? leg.pnr,
          segments: [
            {
              carrier: leg.carrier,
              flight_no: leg.flightNumber,
              dep_airport: found.dep_airport,
              arr_airport: found.arr_airport,
              sched_dep_at: found.sched_dep_at.toISOString(),
            },
          ],
          details: leg.seat === '' ? {} : { seat: leg.seat.slice(0, 8) },
        },
      };
    }
  }
  return null;
}

export async function parseImport(
  pool: pg.Pool,
  deps: ImportParseDeps,
  job: ImportParseJob,
): Promise<'parsed' | 'failed' | 'gone'> {
  const candidate = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<CandidateRow>(
      `SELECT i.user_id, i.crew_id, i.trip_id, coalesce(t.tz, d.tz) AS tz,
              t.start_date::text AS start_date, t.end_date::text AS end_date, u.home_airport
         FROM import_candidates i
         JOIN users u ON u.id = i.user_id
         LEFT JOIN trips t ON t.id = i.trip_id
         LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE i.id = $1 AND i.status = 'parsing'`,
      [job.candidate_id],
    );
    return rows[0];
  });
  if (candidate === undefined) return 'gone';
  const now = deps.now?.() ?? new Date();
  const target = {
    userId: candidate.user_id,
    crewId: candidate.crew_id,
    tripId: candidate.trip_id,
    source: job.kind,
    scope: { kind: 'user' as const, id: candidate.user_id },
    crewVisible: false,
    candidateId: job.candidate_id,
  };
  let html: string | null = null;
  let text = job.text ?? null;
  let refused: 'fetch_failed' | 'blocked_url' | null = null;
  if (job.url !== undefined) {
    const url = new URL(job.url);
    if (isAllowListed(url)) {
      const fetched = await safeFetch(job.url, deps.fetch);
      if (fetched.kind === 'ok') {
        if (fetched.contentType.includes('html')) html = fetched.body;
        else text = fetched.body;
      } else {
        refused =
          fetched.reason === 'private_address' || fetched.reason === 'redirect_off_list'
            ? 'blocked_url'
            : 'fetch_failed';
      }
    } else {
      text = job.url;
    }
  }
  const pass = decodePass(job);
  const scheduled =
    job.kind === 'paste' && html === null && refused === null && text !== null
      ? await scheduledFlight(deps, candidate, text, now)
      : 'not_flight';
  let read: ReadResult =
    scheduled !== 'not_flight'
      ? scheduled
      : refused !== null
        ? { status: 'failed', reason: 'unreadable' }
        : await readConfirmation(
            {
              html,
              text,
              supplier:
                job.url === undefined ? null : supplierOfSender(`x@${new URL(job.url).hostname}`),
              defaultTz: candidate.tz,
              source: job.kind,
            },
            deps,
          );
  let knownBookingId: string | undefined;
  if (pass !== null && job.barcode !== undefined) {
    const barcode = { format: job.barcode.format, payload: job.barcode.payload };
    const joined =
      read.status === 'parsed' ? mergeBoardingPass(read.bookings, pass, barcode, now) : null;
    if (joined !== null && joined.matched && read.status === 'parsed') {
      read = { ...read, bookings: joined.bookings };
    } else {
      const wallet = await walletFlight(pool, candidate.user_id, pass, now);
      if (wallet !== null) {
        const merged = mergeBoardingPass([wallet.booking], pass, barcode, now);
        read = { status: 'parsed', bookings: merged.bookings, needsConfirm: false, via: 'markup' };
        knownBookingId = wallet.bookingId;
      }
    }
  }
  return withSystem(pool, async (tx) => {
    if (read.status === 'failed') {
      await writeFailedCandidate(tx, target, refused ?? read.reason);
      return 'failed';
    }
    await writeCandidates(tx, { ...target, knownBookingId }, read.bookings, read.needsConfirm);
    return 'parsed';
  });
}

/** Only the candidate id is required up front, so a malformed job can still fail its candidate. */
const queuedImportSchema = z.looseObject({ candidate_id: z.uuid() });

export function importParseJob(
  deps: ImportParseDeps,
): JobDefinition<z.output<typeof queuedImportSchema>> {
  return defineJob({
    queue: BOOKINGS_QUEUES.importParse,
    schema: queuedImportSchema,
    singletonKey: (data) => data.candidate_id,
    handler: async (data, ctx) => {
      const job = importParseJobSchema.safeParse(data);
      if (!job.success) {
        ctx.logger.warn({ candidate_id: data.candidate_id }, 'import.parse payload unreadable');
        return { outcome: await failUnreadableImport(ctx.pool, data.candidate_id) };
      }
      return { outcome: await parseImport(ctx.pool, deps, job.data) };
    },
  });
}
