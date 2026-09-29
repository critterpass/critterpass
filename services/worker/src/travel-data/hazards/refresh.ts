/**
 * `hazards.refresh`: reads the curated official feeds each live destination watches (MAGMA for
 * Bali's volcanoes, the Icelandic Met Office, JMA warnings for Kyoto, CENAPRED's Popocatépetl light,
 * GDACS volcano events as the worldwide fallback) and keeps one current `hazard_alerts` row per (destination, feed, subject). A level
 * move is a `hazard.changed` event for every active trip there (a first sighting only when it is
 * above normal); an unchanged level only refreshes `fetched_at`. A feed that fails or stops parsing
 * leaves its last values in place and is logged for ops. The cron fires every 15 minutes; the job
 * reads the feeds then while a trip is under way at a watched destination, and hourly otherwise.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import {
  hazardImpact,
  TRAVEL_DESTINATIONS,
  type HazardKind,
  type HazardLevel,
  type HazardSource,
} from '@cp/domain';
import type pg from 'pg';

import type { JobLogger } from '../../boss/define-job';

export interface HazardReading {
  readonly source: HazardSource;
  readonly kind: HazardKind;
  readonly subject: string;
  readonly level: HazardLevel;
  readonly level_label: string;
  readonly headline: string;
  readonly source_url: string;
  /** Null when the feed carries no time; the refresh dates the level from its first sighting. */
  readonly issued_at: Date | null;
  readonly expires_at: Date | null;
}

/** Each feed returns every subject it publishes; `jma` is asked for the watched area codes. */
export interface HazardFeeds {
  readonly magma: (signal?: AbortSignal) => Promise<HazardReading[]>;
  readonly imo: (signal?: AbortSignal) => Promise<HazardReading[]>;
  readonly jma: (areaCodes: readonly string[], signal?: AbortSignal) => Promise<HazardReading[]>;
  readonly cenapred: (signal?: AbortSignal) => Promise<HazardReading[]>;
  readonly gdacs: (signal?: AbortSignal) => Promise<HazardReading[]>;
}

const normalise = (value: string) =>
  value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export interface HazardRefreshReport {
  readonly feedsRead: number;
  readonly feedsFailed: number;
  readonly updated: number;
  readonly events: number;
}

/** Whether this 15-minute tick should read the feeds: hourly, or every tick with a trip under way. */
export async function isHazardTick(tx: pg.PoolClient, now: Date): Promise<boolean> {
  if (now.getUTCMinutes() < 15) return true;
  const { rows } = await tx.query(
    `SELECT 1 FROM trips t JOIN destinations d ON d.id = t.destination_id
      WHERE t.status = 'in_trip' AND d.slug = ANY ($1) LIMIT 1`,
    [Object.keys(TRAVEL_DESTINATIONS).filter((slug) => TRAVEL_DESTINATIONS[slug]?.hazards.length)],
  );
  return rows.length > 0;
}

async function applyReading(
  tx: pg.PoolClient,
  destinationId: string,
  reading: HazardReading,
  now: Date,
): Promise<number> {
  const existing = (
    await tx.query<{ id: string; level: HazardLevel }>(
      `SELECT id, level FROM hazard_alerts
        WHERE destination_id = $1 AND source = $2 AND subject = $3 FOR UPDATE`,
      [destinationId, reading.source, reading.subject],
    )
  ).rows[0];
  const moved = existing === undefined || existing.level !== reading.level;
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO hazard_alerts (destination_id, kind, subject, level, level_label, headline, source,
       source_url, issued_at, expires_at, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (destination_id, source, subject) DO UPDATE SET
       kind = EXCLUDED.kind, level = EXCLUDED.level, level_label = EXCLUDED.level_label,
       headline = EXCLUDED.headline, source_url = EXCLUDED.source_url,
       issued_at = CASE WHEN $12 THEN EXCLUDED.issued_at ELSE hazard_alerts.issued_at END,
       expires_at = EXCLUDED.expires_at, fetched_at = EXCLUDED.fetched_at
     RETURNING id`,
    [
      destinationId,
      reading.kind,
      reading.subject,
      reading.level,
      reading.level_label,
      reading.headline,
      reading.source,
      reading.source_url,
      reading.issued_at ?? now,
      reading.expires_at,
      now,
      moved || reading.issued_at !== null,
    ],
  );
  const hazardId = rows[0]?.id;
  const from = existing?.level ?? null;
  if (hazardId === undefined || !moved || (from === null && reading.level <= 1)) return 0;

  const trips = await tx.query<{ id: string; crew_id: string }>(
    `SELECT id, crew_id FROM trips
      WHERE destination_id = $1 AND status IN ('confirmed', 'pre_trip', 'in_trip')
        AND (end_date IS NULL OR end_date >= ($2::timestamptz AT TIME ZONE 'UTC')::date - 1)
      ORDER BY id`,
    [destinationId, now],
  );
  for (const trip of trips.rows) {
    await appendDomainEvent(tx, {
      type: 'hazard.changed',
      aggregateKind: 'hazard_alert',
      aggregateId: hazardId,
      actorKind: 'system',
      actorId: null,
      crewId: trip.crew_id,
      tripId: trip.id,
      payload: {
        trip_id: trip.id,
        destination_id: destinationId,
        hazard_id: hazardId,
        kind: reading.kind,
        source: reading.source,
        subject: reading.subject,
        from_level: from,
        to_level: reading.level,
        impact: hazardImpact(from, reading.level),
      },
    });
  }
  return trips.rows.length;
}

export interface RefreshHazardsOptions {
  readonly pool: pg.Pool;
  readonly feeds: HazardFeeds;
  readonly logger: JobLogger;
  readonly now?: Date;
  readonly signal?: AbortSignal;
}

export async function refreshHazards(options: RefreshHazardsOptions): Promise<HazardRefreshReport> {
  const now = options.now ?? new Date();
  const { rows: destinations } = await withSystem(options.pool, (tx) =>
    tx.query<{ id: string; slug: string }>(
      'SELECT id, slug FROM destinations WHERE slug = ANY ($1)',
      [Object.keys(TRAVEL_DESTINATIONS)],
    ),
  );
  const watched = destinations.flatMap((destination) =>
    (TRAVEL_DESTINATIONS[destination.slug]?.hazards ?? []).map((subject) => ({
      destinationId: destination.id,
      ...subject,
    })),
  );
  const sources = [...new Set(watched.map((entry) => entry.source))];
  const readings = new Map<HazardSource, HazardReading[]>();
  let feedsFailed = 0;
  for (const source of sources) {
    try {
      const read =
        source === 'jma'
          ? await options.feeds.jma(
              watched.filter((entry) => entry.source === 'jma').map((entry) => entry.subject),
              options.signal,
            )
          : await options.feeds[source](options.signal);
      readings.set(source, read);
    } catch (error) {
      feedsFailed += 1;
      options.logger.error({ err: error, source }, 'hazard feed failed; last values kept');
    }
  }

  let updated = 0;
  let events = 0;
  for (const entry of watched) {
    const reading = readings
      .get(entry.source)
      ?.find((candidate) => normalise(candidate.subject) === normalise(entry.subject));
    if (reading === undefined) continue;
    events += await withSystem(options.pool, (tx) =>
      applyReading(tx, entry.destinationId, { ...reading, subject: entry.subject }, now),
    );
    updated += 1;
  }
  return { feedsRead: readings.size, feedsFailed, updated, events };
}
