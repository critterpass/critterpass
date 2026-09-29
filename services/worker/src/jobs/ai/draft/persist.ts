/**
 * Saving a draft: one private version per job (`itinerary_versions.created_by_job_id` is unique),
 * its days and items, what it covers and its numbers, all in one transaction. A retried step finds
 * the version it already wrote and returns it. The trip's previous draft is superseded and the
 * trip moves on to review; a trip no longer drafting (the organiser cancelled) saves nothing.
 */
import type { DraftPlanInput, RepairOutcome } from '@cp/ai';
import { closedOn, itineraryMetrics, mustDosKept } from '@cp/planner';
import type {
  ClosureRecord,
  DraftCoverage,
  DraftMetrics,
  Itinerary,
  MustDoMissReason,
  StayRow,
} from '@cp/domain';
import type pg from 'pg';

import type { DraftTripData } from './load';
import { staysPpMinor, tripDates } from './plan-input';

export interface DraftToSave {
  readonly jobId: string;
  readonly trip: DraftTripData;
  readonly input: DraftPlanInput;
  readonly outcome: Pick<RepairOutcome, 'itinerary' | 'first' | 'loops' | 'dropped'>;
  readonly stays: readonly StayRow[];
  readonly closures: readonly ClosureRecord[];
  /** Extra per-item flags (a supplier's own availability answer). */
  readonly slotAvailable: readonly string[];
}

export function draftCoverage(save: DraftToSave): DraftCoverage {
  const { input, outcome, trip } = save;
  const itinerary = outcome.itinerary;
  const placed = new Set(itinerary.days.flatMap((d) => d.items.map((i) => i.must_do_id)));
  const dropped = new Set(outcome.dropped.map((d) => d.mustDoId));
  const missing = input.frame.mustDos
    .filter((m) => !placed.has(m.id))
    .map((m) => {
      const unplaceable = input.pools.unplaceable.find((u) => u.mustDoId === m.id);
      const reason: MustDoMissReason =
        unplaceable?.reason ?? (dropped.has(m.id) ? 'dropped' : 'no_time');
      return { must_do_id: m.id, owner_id: m.ownerId, reason };
    });
  const flags: DraftCoverage['flags'] = [];
  const places: DraftCoverage['places'] = {};
  for (const day of itinerary.days) {
    for (const item of day.items) {
      const poi = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
      if (poi === undefined) continue;
      places[poi.id] = {
        name: poi.name,
        category: poi.category,
        lat: poi.lat,
        lng: poi.lng,
        editorial: poi.editorial,
      };
      if (closedOn(input.frame, poi, day.date) === 'area') {
        flags.push({ stable_id: item.stable_id, flag: 'closed_on_date' });
      }
      if (save.slotAvailable.includes(item.stable_id)) {
        flags.push({ stable_id: item.stable_id, flag: 'slot_available' });
      }
    }
  }
  const dates = tripDates(trip);
  return {
    must_dos: {
      total: input.frame.mustDos.length,
      made: input.frame.mustDos.length - missing.length,
      missing,
    },
    flags,
    closures: [...save.closures],
    stays: [...save.stays],
    places,
    setup: {
      start_date: dates[0] ?? trip.startDate,
      end_date: dates[dates.length - 1] ?? trip.endDate,
      must_do_ids: trip.mustDos.map((m) => m.id),
      budget_version: trip.budget?.version ?? null,
      rooms_version: trip.rooms?.version ?? null,
    },
  };
}

export function draftMetrics(save: DraftToSave): DraftMetrics {
  const { trip, outcome } = save;
  return itineraryMetrics({
    itinerary: outcome.itinerary,
    crewSize: Math.max(1, trip.members.length),
    staysPpMinor: staysPpMinor(trip),
    targetPpMinor:
      trip.budget === null ? null : Math.max(0, trip.budget.targetMinor - trip.budget.flightsMinor),
    validation: {
      first_pass_clean: outcome.first.ok,
      repair_loops: outcome.loops,
      dropped: outcome.dropped.length,
    },
  });
}

/** Writes the version's days and items (the version row already exists). */
export async function insertDays(
  tx: pg.PoolClient,
  tripId: string,
  versionId: string,
  itinerary: Itinerary,
): Promise<void> {
  for (const day of itinerary.days) {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO plan_days (version_id, trip_id, day_no, date, theme) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [versionId, tripId, day.day_no, day.date, day.theme],
    );
    const dayId = rows[0]?.id;
    for (const item of day.items) {
      await tx.query(
        `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
           poi_id, booking_id, must_do_id, category, cost_model, amount_minor, currency, status,
           created_by_kind, notes, locked_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'proposed', 'guide', $15, $16)`,
        [
          versionId,
          dayId,
          tripId,
          item.stable_id,
          item.starts_at,
          item.ends_at,
          item.tz,
          item.poi_id,
          item.booking_id,
          item.must_do_id,
          item.kind,
          item.cost_model,
          item.amount_minor,
          item.currency,
          item.note,
          item.locked_reason,
        ],
      );
    }
  }
}

export type PersistOutcome = { readonly versionId: string; readonly created: boolean } | null;

export async function persistDraft(tx: pg.PoolClient, save: DraftToSave): Promise<PersistOutcome> {
  const existing = await tx.query<{ id: string }>(
    'SELECT id FROM itinerary_versions WHERE created_by_job_id = $1',
    [save.jobId],
  );
  if (existing.rows[0] !== undefined) return { versionId: existing.rows[0].id, created: false };
  const { rows: trips } = await tx.query<{ status: string; draft_version_id: string | null }>(
    'SELECT status, draft_version_id FROM trips WHERE id = $1 FOR UPDATE',
    [save.trip.tripId],
  );
  const trip = trips[0];
  if (trip === undefined || trip.status !== 'drafting') return null;
  const metrics = draftMetrics(save);
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, parent_id, visibility, status, cost_pp_minor, currency,
       created_by_job_id, metrics, coverage)
     VALUES ($1, $2, 'organiser', 'draft', $3, $4, $5, $6, $7) RETURNING id`,
    [
      save.trip.tripId,
      trip.draft_version_id,
      metrics.cost_pp_minor,
      metrics.currency,
      save.jobId,
      JSON.stringify(metrics),
      JSON.stringify(draftCoverage(save)),
    ],
  );
  const versionId = rows[0]?.id;
  if (versionId === undefined) throw new Error('draft version insert returned no id');
  await insertDays(tx, save.trip.tripId, versionId, save.outcome.itinerary);
  if (trip.draft_version_id !== null) {
    await tx.query("UPDATE itinerary_versions SET status = 'superseded' WHERE id = $1", [
      trip.draft_version_id,
    ]);
  }
  await tx.query("UPDATE trips SET draft_version_id = $2, status = 'draft_review' WHERE id = $1", [
    save.trip.tripId,
    versionId,
  ]);
  return { versionId, created: true };
}

/** Must-dos the saved draft kept, for the summary line. */
export function allMustDosMade(save: DraftToSave): boolean {
  const required = save.input.pools.mustDos.map((slot) => slot.mustDoId);
  const kept = mustDosKept(save.outcome.itinerary, required);
  return kept.kept === kept.total && save.input.pools.unplaceable.length === 0;
}
