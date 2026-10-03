/**
 * The recap's reads and writes: the trip and its travellers as the builder sees them, and the one
 * statement set that swaps a new version in (aggregates, awards, viewers, trip stamps). Award ids
 * are stable across versions (one row per traveller, updated in place), so votes and the
 * realtime channel survive every re-run; an award whose numbers changed loses its old words.
 */
import { createHash } from 'node:crypto';

import { type RecapContent, type RecapSection, type RecapStatus } from '@cp/domain';
import type pg from 'pg';

import type { RecapTrip } from './contributors';

export interface TripRow {
  readonly status: string;
  readonly crew_id: string;
  readonly destination_id: string | null;
  readonly tz: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly current_version_id: string | null;
  readonly currency: string;
  readonly today: string;
}

export async function loadTripRow(tx: pg.PoolClient, tripId: string): Promise<TripRow | null> {
  const { rows } = await tx.query<TripRow>(
    `SELECT t.status, t.crew_id, t.destination_id, coalesce(t.tz, d.tz, 'UTC') AS tz,
            t.start_date::text AS start_date, t.end_date::text AS end_date,
            t.current_version_id, coalesce(c.settlement_currency, 'USD') AS currency,
            (now() AT TIME ZONE coalesce(t.tz, d.tz, 'UTC'))::date::text AS today
       FROM trips t
       JOIN crews c ON c.id = t.crew_id
       LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1`,
    [tripId],
  );
  return rows[0] ?? null;
}

/** Everyone who was IN at any point (RSVP in, a dropout, or already a viewer), by user id. */
export async function loadTravellers(tx: pg.PoolClient, tripId: string): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT user_id FROM trip_participants WHERE trip_id = $1 AND rsvp = 'in'
     UNION SELECT user_id FROM trip_dropouts WHERE trip_id = $1
     UNION SELECT user_id FROM recap_views WHERE trip_id = $1
     ORDER BY user_id`,
    [tripId],
  );
  return rows.map((row) => row.user_id);
}

export interface RecapRow {
  readonly id: string;
  readonly status: RecapStatus;
  readonly version: number;
  readonly ended_on: string | null;
  readonly content_hash: string | null;
  readonly stats: unknown;
  readonly route: unknown;
  readonly receipt: unknown;
  readonly got_away: unknown;
}

export async function lockRecap(tx: pg.PoolClient, tripId: string): Promise<RecapRow> {
  const { rows } = await tx.query<RecapRow>(
    `SELECT id, status, version, ended_on::text AS ended_on, content_hash, stats, route, receipt,
            got_away
       FROM recaps WHERE trip_id = $1 FOR UPDATE`,
    [tripId],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`no recap row for trip ${tripId}`);
  return row;
}

/** JSON with every object's keys sorted, so equal content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(content: RecapContent): string {
  return createHash('sha256').update(canonicalJson(content)).digest('hex');
}

async function awardsJson(tx: pg.PoolClient, recapId: string): Promise<string> {
  const { rows } = await tx.query(
    `SELECT user_id, kind, metric, value, evidence FROM recap_awards
      WHERE recap_id = $1 ORDER BY user_id`,
    [recapId],
  );
  return canonicalJson(rows);
}

/** The sections whose content differs from what the row holds now. */
export async function changedSections(
  tx: pg.PoolClient,
  current: RecapRow,
  next: RecapContent,
): Promise<RecapSection[]> {
  const changed: RecapSection[] = [];
  if (canonicalJson(current.stats) !== canonicalJson(next.stats)) changed.push('stats');
  if (canonicalJson(current.route) !== canonicalJson(next.route)) changed.push('route');
  if (canonicalJson(current.receipt) !== canonicalJson(next.receipt)) changed.push('receipt');
  if (canonicalJson(current.got_away) !== canonicalJson(next.got_away)) changed.push('got_away');
  const nextAwards = canonicalJson(
    [...next.awards].sort((a, b) => (a.user_id < b.user_id ? -1 : 1)),
  );
  if ((await awardsJson(tx, current.id)) !== nextAwards) changed.push('awards');
  return changed;
}

export interface WriteVersionInput {
  readonly recap: RecapRow;
  readonly trip: RecapTrip;
  readonly content: RecapContent;
  readonly hash: string;
  readonly version: number;
  readonly changed: readonly RecapSection[];
  readonly now: Date;
}

/** Writes a new version: aggregates, awards, viewers, and the travellers' trip stamps. */
export async function writeVersion(tx: pg.PoolClient, input: WriteVersionInput): Promise<void> {
  const { recap, content, trip, now } = input;
  await tx.query(
    `UPDATE recaps
        SET stats = $2, route = $3, receipt = $4, got_away = $5, content_hash = $6,
            version = $7, changed_sections = $8, ended_on = $9,
            status = CASE WHEN status = 'ready' THEN 'ready' ELSE 'building' END,
            failure_reason = NULL, built_at = $10
      WHERE id = $1`,
    [
      recap.id,
      JSON.stringify(content.stats),
      JSON.stringify(content.route),
      JSON.stringify(content.receipt),
      content.got_away === null ? null : JSON.stringify(content.got_away),
      input.hash,
      input.version,
      input.changed,
      trip.endedOn,
      now,
    ],
  );
  for (const award of content.awards) {
    await tx.query(
      `INSERT INTO recap_awards (recap_id, trip_id, user_id, kind, metric, value, evidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (recap_id, user_id) DO UPDATE
          SET kind = EXCLUDED.kind, metric = EXCLUDED.metric, value = EXCLUDED.value,
              evidence = EXCLUDED.evidence,
              title = CASE WHEN (recap_awards.kind, recap_awards.value, recap_awards.evidence)
                IS NOT DISTINCT FROM (EXCLUDED.kind, EXCLUDED.value, EXCLUDED.evidence)
                THEN recap_awards.title END,
              line = CASE WHEN (recap_awards.kind, recap_awards.value, recap_awards.evidence)
                IS NOT DISTINCT FROM (EXCLUDED.kind, EXCLUDED.value, EXCLUDED.evidence)
                THEN recap_awards.line END`,
      [
        recap.id,
        trip.id,
        award.user_id,
        award.kind,
        award.metric,
        award.value,
        JSON.stringify(award.evidence),
      ],
    );
  }
  await addViewers(
    tx,
    recap.id,
    trip.id,
    content.awards.map((award) => award.user_id),
  );
  await stampTrip(
    tx,
    trip,
    content.awards.map((award) => award.user_id),
    now,
  );
}

/** Every traveller views the recap; a viewer row is never removed. */
export async function addViewers(
  tx: pg.PoolClient,
  recapId: string,
  tripId: string,
  members: readonly string[],
): Promise<void> {
  await tx.query(
    `INSERT INTO recap_views (recap_id, trip_id, user_id)
     SELECT $1, $2, member FROM unnest($3::uuid[]) AS member
     ON CONFLICT (recap_id, user_id) DO NOTHING`,
    [recapId, tripId, members],
  );
}

/**
 * Each traveller with an issued pass gets the trip's stamp, stamped: a stamp made `upcoming` earlier
 * turns `stamped`, otherwise a new page is added after their last one. Ink follows the trip's guide.
 */
async function stampTrip(
  tx: pg.PoolClient,
  trip: RecapTrip,
  members: readonly string[],
  now: Date,
): Promise<void> {
  for (const member of members) {
    await tx.query(
      `INSERT INTO stamps (pass_id, user_id, kind, seq_no, destination_id, trip_id, dates, country,
                           ink_colour, status, stamped_at)
       SELECT p.id, p.user_id, 'trip',
              (SELECT coalesce(max(seq_no), 0) + 1 FROM stamps WHERE user_id = p.user_id),
              t.destination_id, t.id, daterange($3::date, $4::date, '[]'),
              CASE WHEN d.country ~ '^[A-Z]{2}$' THEN d.country END,
              coalesce(g.colour, d.colour), 'stamped', $5
         FROM passes p
         JOIN trips t ON t.id = $2
         LEFT JOIN destinations d ON d.id = t.destination_id
         LEFT JOIN guides g ON g.id = t.guide_id
        WHERE p.user_id = $1 AND p.status = 'issued'
       ON CONFLICT (user_id, trip_id) WHERE kind = 'trip' DO UPDATE
          SET status = 'stamped', stamped_at = coalesce(stamps.stamped_at, EXCLUDED.stamped_at)`,
      [member, trip.id, trip.startDate, trip.endedOn, now],
    );
  }
}
