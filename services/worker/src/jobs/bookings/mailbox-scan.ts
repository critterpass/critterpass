/**
 * `mailbox.scan` (docs/api-contracts-async.md §2.3): each connected mailbox is read once a day in
 * its owner's 07:00 hour (and right after connecting), incrementally (Gmail `historyId`, Graph
 * delta link). Only headers are fetched first; a message is opened only when the trip filter
 * (`shouldReadMessage`: a booking sender or a confirmation subject naming a destination, within 60
 * days of one of the owner's trips) says so, and only its bookings are kept, as candidates. A lapsed
 * Pass+ pauses the scan (the connection stays); a revoked grant marks it for reconnecting. Finds
 * reach the crew only while the owner consents to surfacing them.
 */
import { crypto as dbCrypto, withSystem } from '@cp/db';
import {
  BOOKINGS_QUEUES,
  shouldReadMessage,
  type TripWindow,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import { readConfirmation, tripForBooking, writeCandidates, type ReaderDeps } from './candidates';
import { decodeMail } from './mail-parse';
import {
  accessToken,
  gmailApi,
  GrantRevoked,
  graphApi,
  MAX_HEADERS,
  MAX_OPENED,
  type Connection,
  type ProviderDeps,
} from './mailbox-providers';

export interface MailboxScanDeps extends ReaderDeps, ProviderDeps {
  readonly now?: () => Date;
}

async function tripWindows(pool: pg.Pool, uid: string) {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      crew_id: string;
      start_date: string | null;
      end_date: string | null;
      tz: string | null;
      name: string | null;
    }>(
      `SELECT t.id, t.crew_id, t.start_date::text, t.end_date::text, coalesce(t.tz, d.tz) AS tz, d.name
         FROM trips t JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = $1 AND m.status = 'active'
         LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE t.status NOT IN ('archived', 'cancelled')`,
      [uid],
    );
    return rows;
  });
}

export type ScanOutcome = 'scanned' | 'paused' | 'revoked' | 'gone';

export async function scanMailbox(
  pool: pg.Pool,
  deps: MailboxScanDeps,
  connectionId: string,
): Promise<{ outcome: ScanOutcome; opened: number; candidates: number }> {
  const now = deps.now?.() ?? new Date();
  const connection = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<Connection & { pass_plus: boolean | null }>(
      `SELECT c.id, c.user_id, c.provider, c.refresh_token_enc, c.last_history_id, e.pass_plus
         FROM mailbox_connections c LEFT JOIN user_entitlements e ON e.user_id = c.user_id
        WHERE c.id = $1 AND c.status IN ('active', 'paused')`,
      [connectionId],
    );
    return rows[0];
  });
  if (connection === undefined) return { outcome: 'gone', opened: 0, candidates: 0 };
  const setStatus = (status: string, error: string | null) =>
    withSystem(pool, (tx) =>
      tx.query('UPDATE mailbox_connections SET status = $2, last_error = $3 WHERE id = $1', [
        connectionId,
        status,
        error,
      ]),
    );
  if (connection.pass_plus !== true) {
    await setStatus('paused', 'pass_plus_lapsed');
    return { outcome: 'paused', opened: 0, candidates: 0 };
  }
  let session: { token: string; refreshed: string | null };
  try {
    session = await accessToken(deps, connection);
  } catch (error) {
    if (!(error instanceof GrantRevoked)) throw error;
    await setStatus('revoked', 'grant_revoked');
    return { outcome: 'revoked', opened: 0, candidates: 0 };
  }
  const api =
    connection.provider === 'gmail' ? gmailApi(deps, session.token) : graphApi(deps, session.token);
  const trips = await tripWindows(pool, connection.user_id);
  const windows: TripWindow[] = trips.map((trip) => ({
    startDate: trip.start_date,
    endDate: trip.end_date,
    keywords: trip.name === null ? [] : [trip.name],
  }));
  const listed = await api.list(connection.last_history_id);
  const consent = await withSystem(pool, async (tx) => {
    const { rowCount } = await tx.query(
      `SELECT 1 FROM consents WHERE user_id = $1 AND purpose = 'mailbox_surfacing'
          AND granted_at IS NOT NULL AND revoked_at IS NULL`,
      [connection.user_id],
    );
    return (rowCount ?? 0) > 0;
  });
  let opened = 0;
  let candidates = 0;
  for (const id of listed.ids.slice(0, MAX_HEADERS)) {
    if (opened >= MAX_OPENED) break;
    const headers = windows.length === 0 ? null : await api.headers(id);
    if (headers === null || !shouldReadMessage(headers, windows)) continue;
    const raw = await api.raw(id);
    opened += 1;
    if (raw === null) continue;
    const decoded = await decodeMail(raw);
    const trip = trips[0];
    const read = await readConfirmation(
      {
        html: decoded.html,
        text: decoded.text,
        subject: decoded.subject,
        supplier: decoded.supplier,
        defaultTz: trip?.tz ?? null,
        source: 'mailbox',
      },
      deps,
    );
    if (read.status !== 'parsed') continue;
    await withSystem(pool, async (tx) => {
      for (const booking of read.bookings) {
        const crewTrip = await (async () => {
          for (const candidate of trips) {
            const fit = await tripForBooking(tx, candidate.crew_id, booking.starts_at);
            if (fit !== null) return trips.find((t) => t.id === fit) ?? null;
          }
          return null;
        })();
        const written = await writeCandidates(
          tx,
          {
            userId: connection.user_id,
            crewId: crewTrip?.crew_id ?? null,
            tripId: crewTrip?.id ?? null,
            source: 'mailbox',
            scope: { kind: 'user', id: connection.user_id },
            crewVisible: consent && crewTrip !== null,
          },
          [booking],
          read.needsConfirm,
        );
        candidates += written.created.length;
      }
    });
  }
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE mailbox_connections SET last_history_id = $2, last_scan_at = $3, status = 'active',
         last_error = NULL, refresh_token_enc = coalesce($4, refresh_token_enc)
       WHERE id = $1`,
      [
        connectionId,
        listed.cursor,
        now,
        session.refreshed === null || deps.keyring === undefined
          ? null
          : dbCrypto.encryptField(session.refreshed, deps.keyring),
      ],
    ),
  );
  return { outcome: 'scanned', opened, candidates };
}

/** Connections due now: their owner's local hour is 07 and they were not scanned in 20 hours. */
export async function dueConnections(pool: pg.Pool, now: Date): Promise<string[]> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT c.id FROM mailbox_connections c JOIN users u ON u.id = c.user_id
        WHERE c.status IN ('active', 'paused')
          AND extract(hour FROM $1::timestamptz AT TIME ZONE coalesce(u.tz, 'UTC')) = 7
          AND (c.last_scan_at IS NULL OR c.last_scan_at < $1::timestamptz - interval '20 hours')
        ORDER BY c.last_scan_at NULLS FIRST LIMIT 200`,
      [now],
    );
    return rows.map((row) => row.id);
  });
}

const scanJobSchema = z.object({ connection_id: z.uuid().optional() }).passthrough();

export function mailboxScanJob(
  deps: MailboxScanDeps,
): JobDefinition<z.infer<typeof scanJobSchema>> {
  return defineJob({
    queue: BOOKINGS_QUEUES.mailboxScan,
    schema: scanJobSchema,
    handler: async (data, ctx) => {
      const ids =
        data.connection_id === undefined
          ? await dueConnections(ctx.pool, new Date())
          : [data.connection_id];
      const outcomes: string[] = [];
      for (const id of ids) {
        try {
          outcomes.push((await scanMailbox(ctx.pool, deps, id)).outcome);
        } catch {
          outcomes.push('failed');
        }
      }
      return { scanned: outcomes.filter((o) => o === 'scanned').length, total: ids.length };
    },
  });
}
