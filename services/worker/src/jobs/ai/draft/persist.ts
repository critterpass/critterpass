/**
 * Saving a draft: one private version per job (`itinerary_versions.created_by_job_id` is unique),
 * its days and items, what it covers and its numbers, all in one transaction. A retried step finds
 * the version it already wrote and returns it. The trip's previous draft is superseded and the
 * trip moves on to review; a trip no longer drafting (the organiser cancelled) saves nothing.
 */
import { essentialsLeftOut, shownName, type DraftPlanInput, type RepairOutcome } from '@cp/ai';
import { dropReplacedDraft, writeBookedPlanItems } from '@cp/db';
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

import { carryBaseRows, type HeldStop } from './held-stops';
import type { DraftTripData } from './load';
import { staysPpMinor, tripDates } from './plan-input';

export interface DraftToSave {
  readonly jobId: string;
  readonly trip: DraftTripData;
  readonly input: DraftPlanInput;
  readonly outcome: Pick<RepairOutcome, 'itinerary' | 'first' | 'loops' | 'dropped'>;
  readonly stays: readonly StayRow[];
  readonly closures: readonly ClosureRecord[];
  /** Stops the organiser placed by hand on the draft this one replaces (./held-stops.ts). */
  readonly held?: readonly HeldStop[];
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
        name: shownName(input, poi),
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
  // Counted on the draft as it is saved (her own stops back in place).
  const leftOut = essentialsLeftOut(input, itinerary).flatMap((gap) => {
    const poi = input.pois.get(gap.poiId);
    return poi === undefined
      ? []
      : [{ poi_id: poi.id, name: shownName(input, poi), reason: gap.reason }];
  });
  const dates = tripDates(trip);
  // A must-do she placed herself was never the guide's to place: it counts as made.
  const asked = new Set(input.frame.mustDos.map((m) => m.id));
  const hers = trip.mustDos.filter((m) => !asked.has(m.id) && placed.has(m.id)).length;
  const total = input.frame.mustDos.length + hers;
  return {
    must_dos: { total, made: total - missing.length, missing },
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
    // What the guide answered to the typed must-dos: a redraft of this version plans from them.
    wish_answers: (input.wishAnswers ?? []).map((answer) => ({
      must_do_id: answer.wishId,
      poi_id: answer.poiId,
      day_no: answer.dayNo,
      when: answer.when,
      weekdays: [...answer.weekdays],
    })),
    untimed_must_dos: (input.untimed ?? []).map((entry) => ({
      must_do_id: entry.mustDoId,
      reason: entry.reason,
    })),
    // What the review screen says was left out, by the name the organiser reads.
    ...(leftOut.length === 0 ? {} : { essentials_left_out: leftOut }),
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

async function isUntouchedEmptyPlan(tx: pg.PoolClient, versionId: string): Promise<boolean> {
  const { rows } = await tx.query<{ untouched: boolean }>(
    `SELECT v.origin = 'dates' AND NOT EXISTS (
              SELECT 1 FROM plan_items i WHERE i.version_id = v.id AND i.booking_id IS NULL
            ) AS untouched
       FROM itinerary_versions v WHERE v.id = $1`,
    [versionId],
  );
  return rows[0]?.untouched === true;
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
  // The trip's days before any draft are an empty plan: one nobody put a stop on is not a draft
  // worth keeping in the history, so the guide's draft takes its place rather than follows it.
  const untouched =
    trip.draft_version_id !== null && (await isUntouchedEmptyPlan(tx, trip.draft_version_id));
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, parent_id, visibility, status, cost_pp_minor, currency,
       created_by_job_id, metrics, coverage, origin)
     VALUES ($1, $2, 'organiser', 'draft', $3, $4, $5, $6, $7, 'guide') RETURNING id`,
    [
      save.trip.tripId,
      untouched ? null : trip.draft_version_id,
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
  if (trip.draft_version_id !== null && !untouched) {
    // Her stops keep everything the planner's items do not carry, and their places their names.
    await carryBaseRows(tx, trip.draft_version_id, versionId);
    await tx.query(
      `UPDATE itinerary_versions v
          SET coverage = jsonb_set(v.coverage, '{places}',
                coalesce(b.coverage->'places', '{}'::jsonb) || coalesce(v.coverage->'places', '{}'::jsonb))
         FROM itinerary_versions b WHERE v.id = $1 AND b.id = $2`,
      [versionId, trip.draft_version_id],
    );
  }
  // Bookings already in the wallet sit on the draft as anchored items from the start.
  await writeBookedPlanItems(tx, save.trip.tripId, versionId);
  if (trip.draft_version_id !== null) {
    await tx.query("UPDATE itinerary_versions SET status = 'superseded' WHERE id = $1", [
      trip.draft_version_id,
    ]);
  }
  await tx.query("UPDATE trips SET draft_version_id = $2, status = 'draft_review' WHERE id = $1", [
    save.trip.tripId,
    versionId,
  ]);
  if (untouched && trip.draft_version_id !== null) {
    await dropReplacedDraft(tx, trip.draft_version_id);
  }
  return { versionId, created: true };
}

/** Must-dos the saved draft kept, for the summary line. */
export function allMustDosMade(save: DraftToSave): boolean {
  const required = save.input.pools.mustDos.map((slot) => slot.mustDoId);
  const kept = mustDosKept(save.outcome.itinerary, required);
  return kept.kept === kept.total && save.input.pools.unplaceable.length === 0;
}
