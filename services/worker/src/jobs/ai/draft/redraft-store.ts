/**
 * What a redraft reads and writes. The base day comes through the guide's own view of the plan
 * (`llm.plan_items`, which shows an organiser draft only to its organisers) and the crew's recent
 * chat through `llm.chat_window` (text messages only, member-written ones kept); the candidate is
 * saved as a whole new private version (status `drafting`, one per job) with the redrafted day, so
 * keeping it is a pointer move and reverting it touches nothing else.
 */
import type { ChatLine } from '@cp/ai';
import { withGuideReader } from '@cp/db';
import {
  draftCoverageSchema,
  type DraftCoverage,
  type DraftDay,
  type DraftItem,
  type DraftMetrics,
  type Itinerary,
} from '@cp/domain';
import type { DraftPoi, TravelMatrix } from '@cp/planner';
import type pg from 'pg';

import { insertDays } from './persist';

interface PlanRow {
  readonly version_id: string;
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
}

export interface BaseDraft {
  readonly itinerary: Itinerary;
  readonly chat: ChatLine[];
}

/** The organiser's current draft (only when it is `versionId`) and the crew's last messages. */
export async function loadBaseDraft(
  pool: pg.Pool,
  organiser: string,
  tripId: string,
  crewId: string,
  versionId: string,
  travel: TravelMatrix,
): Promise<BaseDraft | null> {
  return withGuideReader(pool, organiser, tripId, async (tx) => {
    const { rows } = await tx.query<PlanRow>(
      `SELECT version_id, day_no, date::text AS date, theme, stable_id, category, poi_id, starts_at,
              ends_at, tz, must_do_id, booking_id, locked_reason, cost_model, amount_minor, currency, notes
         FROM llm.plan_items WHERE version_id = $1 ORDER BY day_no, starts_at`,
      [versionId],
    );
    if (rows.length === 0) return null;
    const days = new Map<number, DraftDay>();
    for (const row of rows) {
      const day = days.get(row.day_no) ?? {
        day_no: row.day_no,
        date: row.date,
        theme: row.theme ?? '',
        items: [],
      };
      days.set(row.day_no, day);
      const previous = day.items[day.items.length - 1];
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
        currency: row.currency ?? 'USD',
        travel_min:
          previous?.poi_id == null || row.poi_id === null
            ? 0
            : (travel(previous.poi_id, row.poi_id) ?? 0),
        note: row.notes,
      });
    }
    const chat = await tx.query<{
      seq: string;
      author_kind: string;
      author_name: string | null;
      body: string;
      created_at: Date;
    }>('SELECT seq, author_kind, author_name, body, created_at FROM llm.chat_window($1, 30)', [
      crewId,
    ]);
    return {
      itinerary: { currency: rows[0]?.currency ?? 'USD', days: [...days.values()] },
      chat: chat.rows
        .filter((m) => m.author_kind === 'member' && m.body.trim().length > 0)
        .map((m) => ({
          id: `chat-${m.seq}`,
          author: (m.author_name ?? 'A member').split(/\s+/u)[0] ?? 'A member',
          text: m.body,
          at: m.created_at.toISOString(),
        })),
    };
  });
}

/** The base version's coverage with the candidate's places added and its must-dos recounted. */
export async function candidateCoverage(
  tx: pg.PoolClient,
  baseVersionId: string,
  itinerary: Itinerary,
  pois: ReadonlyMap<string, DraftPoi>,
): Promise<DraftCoverage | null> {
  const { rows } = await tx.query<{ coverage: unknown }>(
    'SELECT coverage FROM itinerary_versions WHERE id = $1',
    [baseVersionId],
  );
  const parsed = draftCoverageSchema.safeParse(rows[0]?.coverage);
  if (!parsed.success) return null;
  const base = parsed.data;
  const places = { ...base.places };
  const placed = new Set<string>();
  for (const day of itinerary.days) {
    for (const item of day.items) {
      if (item.must_do_id !== null) placed.add(item.must_do_id);
      const poi = item.poi_id === null ? undefined : pois.get(item.poi_id);
      if (poi !== undefined && places[poi.id] === undefined) {
        places[poi.id] = {
          name: poi.name,
          category: poi.category,
          lat: poi.lat,
          lng: poi.lng,
          editorial: poi.editorial,
        };
      }
    }
  }
  const missing = base.must_dos.missing.filter((m) => !placed.has(m.must_do_id));
  return {
    ...base,
    places,
    must_dos: { ...base.must_dos, made: base.must_dos.total - missing.length, missing },
  };
}

/** Saves the candidate: the whole trip with the new day, private and not yet adopted. */
export async function saveCandidate(
  tx: pg.PoolClient,
  input: {
    readonly jobId: string;
    readonly tripId: string;
    readonly baseVersionId: string;
    readonly itinerary: Itinerary;
    readonly metrics: DraftMetrics;
    readonly coverage: DraftCoverage | null;
  },
): Promise<string> {
  const existing = await tx.query<{ id: string }>(
    'SELECT id FROM itinerary_versions WHERE created_by_job_id = $1',
    [input.jobId],
  );
  if (existing.rows[0] !== undefined) return existing.rows[0].id;
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, parent_id, visibility, status, cost_pp_minor, currency,
       created_by_job_id, metrics, coverage)
     VALUES ($1, $2, 'organiser', 'drafting', $3, $4, $5, $6, $7) RETURNING id`,
    [
      input.tripId,
      input.baseVersionId,
      input.metrics.cost_pp_minor,
      input.metrics.currency,
      input.jobId,
      JSON.stringify(input.metrics),
      input.coverage === null ? null : JSON.stringify(input.coverage),
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('candidate version insert returned no id');
  await insertDays(tx, input.tripId, id, input.itinerary);
  return id;
}
