/**
 * Draft version plumbing for the redraft and restore commands, run as the server: copying a
 * version (a restored draft or a kept redraft with some changes toggled off becomes a new version
 * whose parent is the draft it replaces), putting back the base day's state for toggled-off
 * changes, and re-deriving the numbers and must-do coverage from the items actually kept.
 */
import {
  draftCoverageSchema,
  draftMetricsSchema,
  type DraftDay,
  type DraftItem,
  type Itinerary,
} from '@cp/domain';
import { itineraryMetrics, straightLineMatrix, type DraftPoi } from '@cp/planner';
import type pg from 'pg';

const ITEM_COLUMNS = `stable_id, starts_at, ends_at, tz, lane, attendee_ids, poi_id, provider_id, booking_id,
  must_do_id, category, cost_model, amount_minor, currency, status, flexibility, is_outdoor,
  created_by_kind, notes, locked_reason`;

/**
 * A new organiser draft copied from `source` (leaving out the items in `skip`), parented on
 * `parent`; returns its id.
 */
export async function copyVersion(
  tx: pg.PoolClient,
  source: string,
  parent: string | null,
  skip: readonly string[] = [],
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, parent_id, visibility, status, cost_pp_minor, currency,
       metrics, coverage)
     SELECT trip_id, $2, 'organiser', 'draft', cost_pp_minor, currency, metrics, coverage
       FROM itinerary_versions WHERE id = $1
     RETURNING id`,
    [source, parent],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no version ${source} to copy`);
  await tx.query(
    `INSERT INTO plan_days (version_id, trip_id, day_no, date, theme, weather_ref)
     SELECT $2, trip_id, day_no, date, theme, weather_ref FROM plan_days WHERE version_id = $1`,
    [source, id],
  );
  await tx.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, ${ITEM_COLUMNS})
     SELECT $2, nd.id, i.trip_id, ${ITEM_COLUMNS.split(',')
       .map((c) => `i.${c.trim()}`)
       .join(', ')}
       FROM plan_items i
       JOIN plan_days od ON od.id = i.day_id
       JOIN plan_days nd ON nd.version_id = $2 AND nd.day_no = od.day_no
      WHERE i.version_id = $1 AND NOT (i.stable_id = ANY($3::uuid[]))`,
    [source, id, skip],
  );
  return id;
}

/**
 * Puts `stableIds` into `target` as they were in `base` (a change the redraft added has no base
 * item, so it simply stays out).
 */
export async function restoreItems(
  tx: pg.PoolClient,
  target: string,
  base: string,
  stableIds: readonly string[],
): Promise<void> {
  if (stableIds.length === 0) return;
  await tx.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, ${ITEM_COLUMNS})
     SELECT $1, nd.id, i.trip_id, ${ITEM_COLUMNS.split(',')
       .map((c) => `i.${c.trim()}`)
       .join(', ')}
       FROM plan_items i
       JOIN plan_days od ON od.id = i.day_id
       JOIN plan_days nd ON nd.version_id = $1 AND nd.day_no = od.day_no
      WHERE i.version_id = $2 AND i.stable_id = ANY($3::uuid[])`,
    [target, base, stableIds],
  );
}

interface ItemRow {
  readonly day_no: number;
  readonly date: string;
  readonly theme: string | null;
  readonly stable_id: string;
  readonly category: string | null;
  readonly poi_id: string | null;
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly tz: string | null;
  readonly must_do_id: string | null;
  readonly booking_id: string | null;
  readonly locked_reason: DraftItem['locked_reason'];
  readonly cost_model: string | null;
  readonly amount_minor: string | null;
  readonly currency: string | null;
  readonly notes: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

/** The version's days as the planner reads them (travel re-derived from the matrix). */
export async function readItinerary(tx: pg.PoolClient, versionId: string): Promise<Itinerary> {
  const { rows } = await tx.query<ItemRow>(
    `SELECT d.day_no, d.date::text AS date, d.theme, i.stable_id, i.category, i.poi_id, i.starts_at,
            i.ends_at, i.tz, i.must_do_id, i.booking_id, i.locked_reason, i.cost_model,
            i.amount_minor, i.currency, i.notes, p.lat, p.lng
       FROM plan_days d
       LEFT JOIN plan_items i ON i.day_id = d.id
       LEFT JOIN pois p ON p.id = i.poi_id
      WHERE d.version_id = $1
      ORDER BY d.day_no, i.starts_at`,
    [versionId],
  );
  const places = new Map<string, DraftPoi>();
  for (const row of rows) {
    if (row.poi_id === null || row.lat === null || row.lng === null) continue;
    places.set(row.poi_id, {
      id: row.poi_id,
      name: '',
      category: row.category ?? 'other',
      lat: row.lat,
      lng: row.lng,
      tz: row.tz ?? 'UTC',
      hours: null,
      priceLevel: null,
      tags: [],
      durationMin: 0,
      editorial: true,
      mustSee: false,
    });
  }
  const travel = straightLineMatrix(places);
  const days = new Map<number, DraftDay>();
  let currency = 'USD';
  for (const row of rows) {
    const day = days.get(row.day_no) ?? {
      day_no: row.day_no,
      date: row.date,
      theme: row.theme ?? '',
      items: [],
    };
    days.set(row.day_no, day);
    if (row.stable_id === null) continue;
    currency = row.currency ?? currency;
    const previous = day.items[day.items.length - 1];
    const leg =
      previous?.poi_id == null || row.poi_id === null
        ? 0
        : (travel(previous.poi_id, row.poi_id) ?? 0);
    day.items.push({
      stable_id: row.stable_id,
      kind: row.category === 'meal' ? 'meal' : 'activity',
      poi_id: row.poi_id,
      starts_at: row.starts_at.toISOString(),
      ends_at: row.ends_at.toISOString(),
      tz: row.tz ?? 'UTC',
      must_do_id: row.must_do_id,
      booking_id: row.booking_id,
      locked_reason: row.locked_reason,
      cost_model: row.cost_model === 'group' ? 'group' : 'per_person',
      amount_minor: Number(row.amount_minor ?? 0),
      currency: row.currency ?? currency,
      travel_min: leg,
      note: row.notes,
    });
  }
  return { currency, days: [...days.values()] };
}

/** Re-derives a version's numbers and must-do coverage from the items it now holds. */
export async function refreshNumbers(
  tx: pg.PoolClient,
  versionId: string,
  crewSize: number,
): Promise<void> {
  const { rows } = await tx.query<{ metrics: unknown; coverage: unknown }>(
    'SELECT metrics, coverage FROM itinerary_versions WHERE id = $1',
    [versionId],
  );
  const metrics = draftMetricsSchema.safeParse(rows[0]?.metrics);
  const coverage = draftCoverageSchema.safeParse(rows[0]?.coverage);
  if (!metrics.success || !coverage.success) return;
  const itinerary = await readItinerary(tx, versionId);
  const daysCost = metrics.data.days.reduce((sum, day) => sum + day.cost_pp_minor, 0);
  const next = itineraryMetrics({
    itinerary,
    crewSize,
    staysPpMinor: Math.max(0, metrics.data.cost_pp_minor - daysCost),
    targetPpMinor: metrics.data.target_pp_minor,
    validation: metrics.data.validation,
  });
  const placed = new Set(itinerary.days.flatMap((d) => d.items.map((i) => i.must_do_id)));
  const { rows: owners } = await tx.query<{ id: string; owner_id: string }>(
    'SELECT id, owner_id FROM must_dos WHERE id = ANY($1::uuid[])',
    [coverage.data.setup.must_do_ids],
  );
  const all = owners.map((row) => ({ id: row.id, owner: row.owner_id }));
  const known = new Map(coverage.data.must_dos.missing.map((m) => [m.must_do_id, m]));
  const missing = all
    .filter((m) => !placed.has(m.id))
    .map(
      (m) => known.get(m.id) ?? { must_do_id: m.id, owner_id: m.owner, reason: 'no_time' as const },
    );
  const nextCoverage = {
    ...coverage.data,
    must_dos: { total: all.length, made: all.length - missing.length, missing },
  };
  await tx.query(
    'UPDATE itinerary_versions SET metrics = $2, coverage = $3, cost_pp_minor = $4 WHERE id = $1',
    [versionId, JSON.stringify(next), JSON.stringify(nextCoverage), next.cost_pp_minor],
  );
}
