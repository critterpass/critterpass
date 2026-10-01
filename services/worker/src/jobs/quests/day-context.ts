/**
 * The quest day a generator run sees: today's plan items and their places (through the guide's
 * `llm.plan_items` view, as the trip's organiser, so no C3 field and no draft reaches the prompt),
 * who is travelling, whether anyone shares visits, the destination's critter sets and co-presence
 * spawns, and whether the trip still has money to settle. Visit history itself is never read.
 */
import { withGuideReader, withSystem } from '@cp/db';
import {
  EXPENSE_CATEGORIES,
  localSchedule,
  toLocalWallTime,
  type QuestDay,
  type QuestPlanItem,
} from '@cp/domain';
import type pg from 'pg';

export interface QuestTrip {
  readonly id: string;
  readonly crew_id: string;
  readonly organiser_id: string | null;
  readonly tz: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly destination_id: string | null;
  readonly place: string;
  readonly guide_slug: string | null;
}

/** A trip travelling on `localDate`: the date within its dates, whatever planning stage it reached. */
export async function questTrip(
  tx: pg.PoolClient,
  tripId: string,
  localDate: string,
): Promise<QuestTrip | undefined> {
  const { rows } = await tx.query<QuestTrip>(
    `SELECT t.id, t.crew_id, coalesce(t.tz, d.tz, 'UTC') AS tz, t.start_date::text AS start_date,
            t.end_date::text AS end_date, t.destination_id, coalesce(d.name, '') AS place,
            g.slug AS guide_slug,
            (SELECT p.user_id FROM trip_participants p
              WHERE p.trip_id = t.id AND p.role = 'organiser' AND p.rsvp <> 'out'
              ORDER BY p.created_at LIMIT 1) AS organiser_id
       FROM trips t
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN guides g ON g.id = t.guide_id
      WHERE t.id = $1 AND t.status NOT IN ('voting', 'cancelled', 'archived')
        AND t.start_date IS NOT NULL AND t.end_date IS NOT NULL
        AND $2::date BETWEEN t.start_date AND t.end_date`,
    [tripId, localDate],
  );
  return rows[0];
}

/** The local day as UTC instants: [00:00, next 00:00). */
export function dayBounds(localDate: string, tz: string): { start: Date; end: Date } {
  const start = localSchedule({ date: localDate, time: '00:00', tz });
  const next = new Date(Date.parse(`${localDate}T00:00:00Z`) + 86_400_000).toISOString();
  return { start, end: localSchedule({ date: next.slice(0, 10), time: '00:00', tz }) };
}

interface PlanRow {
  readonly stable_id: string;
  readonly poi_id: string | null;
  readonly poi_name: string | null;
  readonly category: string | null;
  readonly starts_at: Date | null;
}

/**
 * When the crew can first be there on the trip's first date: the latest scheduled arrival of the
 * trip's flights landing that day, or null on any other date or with no flight on file.
 */
export async function firstDayArrival(
  tx: pg.PoolClient,
  trip: QuestTrip,
  localDate: string,
): Promise<Date | null> {
  if (localDate !== trip.start_date) return null;
  const { start, end } = dayBounds(localDate, trip.tz);
  const { rows } = await tx.query<{ at: Date | null }>(
    `SELECT max(sched_arr_at) AS at FROM flight_segments
      WHERE trip_id = $1 AND status <> 'cancelled' AND sched_arr_at >= $2 AND sched_arr_at < $3`,
    [trip.id, start, end],
  );
  return rows[0]?.at ?? null;
}

async function planItems(pool: pg.Pool, trip: QuestTrip, localDate: string, arrival: Date | null) {
  if (trip.organiser_id === null) return [];
  const { start, end } = dayBounds(localDate, trip.tz);
  const rows = await withGuideReader(pool, trip.organiser_id, trip.id, async (tx) => {
    const result = await tx.query<PlanRow>(
      `SELECT stable_id, poi_id, poi_name, category, starts_at FROM llm.plan_items
        WHERE (date = $1::date OR (starts_at >= $2 AND starts_at < $3))
        ORDER BY starts_at NULLS LAST, stable_id`,
      [localDate, start, end],
    );
    return result.rows;
  });
  const seen = new Set<string>();
  const items: QuestPlanItem[] = [];
  for (const row of rows) {
    if (seen.has(row.stable_id)) continue;
    // A stop that starts before the crew lands is not theirs to chase today.
    if (arrival !== null && row.starts_at !== null && row.starts_at <= arrival) continue;
    seen.add(row.stable_id);
    items.push({
      id: row.stable_id,
      poi_id: row.poi_id,
      name: row.poi_name ?? row.category ?? '',
      start:
        row.starts_at === null ? null : toLocalWallTime(row.starts_at, trip.tz).time.slice(0, 5),
      category: row.category,
    });
  }
  return items.filter((item) => item.name.length > 0);
}

interface DayFacts {
  readonly travellers: number;
  readonly visit_consent: boolean;
  readonly sets: string[];
  readonly copresence: { poi_ids: string[]; form_id: string }[];
  readonly open_balance: boolean;
}

export async function loadQuestDay(
  pool: pg.Pool,
  trip: QuestTrip,
  localDate: string,
  arrival: Date | null = null,
): Promise<QuestDay> {
  const items = await planItems(pool, trip, localDate, arrival);
  const facts = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<DayFacts>(
      `SELECT
         (SELECT count(*)::int FROM trip_participants p
           WHERE p.trip_id = $1 AND p.rsvp NOT IN ('out', 'waitlisted')) AS travellers,
         EXISTS (SELECT 1 FROM trip_participants p JOIN consents c ON c.user_id = p.user_id
                  WHERE p.trip_id = $1 AND p.rsvp NOT IN ('out', 'waitlisted')
                    AND c.purpose = 'visit_detection' AND c.granted_at IS NOT NULL
                    AND c.revoked_at IS NULL) AS visit_consent,
         coalesce((SELECT array_agg(DISTINCT s.code) FROM destinations d
                    JOIN critter_sets s ON s.id = d.critter_set_id OR s.destination_id = d.id
                   WHERE d.id = $2), '{}') AS sets,
         coalesce((SELECT json_agg(json_build_object('poi_ids', r.poi_ids, 'form_id', r.form_id))
                     FROM spawn_rules r WHERE r.destination_id = $2 AND r.kind = 'co_presence'),
                  '[]') AS copresence,
         (EXISTS (SELECT 1 FROM expenses e WHERE e.trip_id = $1 AND e.deleted_at IS NULL)
          AND NOT EXISTS (SELECT 1 FROM stickers s WHERE s.trip_id = $1 AND s.kind = 'settled'))
           AS open_balance`,
      [trip.id, trip.destination_id],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('quest day facts returned no row');
    return row;
  });
  const copresenceForms: Record<string, string> = {};
  for (const rule of facts.copresence) {
    for (const poi of rule.poi_ids) copresenceForms[poi] = rule.form_id;
  }
  return {
    localDate,
    tz: trip.tz,
    travellers: Math.max(1, facts.travellers),
    visitConsent: facts.visit_consent,
    items,
    expenseCategories: [...EXPENSE_CATEGORIES],
    critterSets: facts.sets,
    copresenceForms,
    openBalance: facts.open_balance,
    lastDay: localDate === trip.end_date,
  };
}
