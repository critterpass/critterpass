/**
 * A trip's days before any draft: the empty plan a trip gets when its dates lock, and what happens
 * to a plan the organiser already built when the dates change under it.
 *
 * A dates change never loses a stop. Every stop keeps its day number and its local time of day on
 * the new dates. A stop on a day the shorter trip no longer has goes back to Ideas when it is a
 * place of ours, and otherwise moves to the last day; the caller is told which stops moved and
 * where. Booked stops follow their bookings, not this rule.
 */
import { dropReplacedDraft, writeBookedPlanItems } from '@cp/db';
import type { MovedStop, PlanState, PlanStateItem } from '@cp/domain';
import type pg from 'pg';

import { backIdea, type IdeaPlace } from '../commands/ideas';
import {
  createEmptyDraft,
  draftChanged,
  writeDraftVersion,
  type DraftHead,
} from './draft-versioning';
import { loadPlanState } from './versioning';

export interface EnsuredDays {
  readonly versionId: string | null;
  readonly created: boolean;
}

/**
 * Gives the trip its empty plan when it has locked dates and no plan of any kind; a trip that has
 * a draft or a crew plan is left alone. Runs as the system, under the trip lock.
 */
export async function ensureDraftDays(tx: pg.PoolClient, head: DraftHead): Promise<EnsuredDays> {
  const existing = head.currentVersionId ?? head.draftVersionId;
  if (existing !== null) return { versionId: existing, created: false };
  if (head.startDate === null || head.endDate === null) return { versionId: null, created: false };
  return { versionId: await createEmptyDraft(tx, head), created: true };
}

function daysApart(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
}

async function placeOf(tx: pg.PoolClient, poiId: string): Promise<IdeaPlace | null> {
  const { rows } = await tx.query<IdeaPlace>(
    `SELECT id AS "poiId", name, name_local AS "nameLocal", category, lat, lng
       FROM pois WHERE id = $1 AND status = 'active'`,
    [poiId],
  );
  return rows[0] ?? null;
}

/** Each kept stop at the same local time of day on its day's new date. */
async function onNewDates(
  tx: pg.PoolClient,
  baseVersionId: string,
  start: string,
  tz: string,
  kept: readonly PlanStateItem[],
): Promise<PlanStateItem[]> {
  const { rows } = await tx.query<{
    stable_id: string;
    starts_at: Date | null;
    ends_at: Date | null;
  }>(
    `SELECT o.stable_id,
            ((o.starts_at AT TIME ZONE z.tz) + make_interval(days => z.shift)) AT TIME ZONE z.tz AS starts_at,
            ((o.ends_at AT TIME ZONE z.tz) + make_interval(days => z.shift)) AT TIME ZONE z.tz AS ends_at
       FROM jsonb_to_recordset($2::jsonb) AS r(stable_id uuid, day_no int)
       JOIN plan_items o ON o.version_id = $1 AND o.stable_id = r.stable_id
       JOIN plan_days od ON od.id = o.day_id
       CROSS JOIN LATERAL (
         SELECT coalesce(o.tz, $4) AS tz,
                coalesce(($3::date + (r.day_no - 1)) - od.date, 0) AS shift
       ) z`,
    [
      baseVersionId,
      JSON.stringify(kept.map((item) => ({ stable_id: item.stable_id, day_no: item.day_no }))),
      start,
      tz,
    ],
  );
  const times = new Map(rows.map((row) => [row.stable_id, row]));
  return kept.map((item) => {
    const at = times.get(item.stable_id);
    if (at === undefined || at.starts_at === null || at.ends_at === null) return item;
    return { ...item, starts_at: at.starts_at.toISOString(), ends_at: at.ends_at.toISOString() };
  });
}

export interface ReshapeInput {
  readonly head: DraftHead;
  readonly start: string;
  readonly end: string;
  readonly tz: string;
  readonly actorId: string;
}

/**
 * Puts the trip's draft on its new dates (the trip row already carries them) and returns the
 * stops that could not stay on their day. Runs as the system, under the trip lock.
 */
export async function reshapeDraftDays(
  tx: pg.PoolClient,
  input: ReshapeInput,
): Promise<readonly MovedStop[]> {
  const { head, start, end } = input;
  const base = head.draftVersionId;
  if (base === null) return [];
  const state = await loadPlanState(tx, base);
  const length = daysApart(start, end) + 1;
  const stops = state.items.filter((item) => item.booking_id == null);
  if (stops.length === 0) {
    // Nothing of hers to carry: a fresh empty plan, with her bookings laid on.
    await tx.query("UPDATE itinerary_versions SET status = 'superseded' WHERE id = $1", [base]);
    const fresh = await createEmptyDraft(tx, { ...head, startDate: start, endDate: end });
    await dropReplacedDraft(tx, base);
    await writeBookedPlanItems(tx, head.tripId, fresh);
    return [];
  }
  const themes = new Map(state.days.map((day) => [day.day_no, day.theme]));
  const moved: MovedStop[] = [];
  const kept: PlanStateItem[] = [];
  for (const item of stops) {
    if (item.day_no <= length) {
      kept.push(item);
      continue;
    }
    const place = item.poi_id == null ? null : await placeOf(tx, item.poi_id);
    if (place === null) {
      kept.push({ ...item, day_no: length });
      moved.push({ stable_id: item.stable_id, to: 'day', day_no: length });
      continue;
    }
    await backIdea(tx, {
      tripId: head.tripId,
      crewId: head.crewId,
      uid: input.actorId,
      place,
      source: 'save',
    });
    moved.push({ stable_id: item.stable_id, to: 'ideas' });
  }
  const next: PlanState = {
    days: Array.from({ length }, (_, index) => ({
      day_no: index + 1,
      date: addDays(start, index),
      theme: themes.get(index + 1) ?? null,
    })),
    items: await onNewDates(tx, base, start, input.tz, kept),
  };
  const versionId = await writeDraftVersion(tx, {
    head,
    baseVersionId: base,
    next,
    origin: 'hand',
  });
  await writeBookedPlanItems(tx, head.tripId, versionId);
  await draftChanged(tx, {
    head,
    versionId,
    baseVersionId: base,
    opCount: kept.length,
    actorId: input.actorId,
  });
  return moved;
}
