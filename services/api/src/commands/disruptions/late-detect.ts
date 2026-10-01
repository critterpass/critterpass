/**
 * Opening, joining and closing a running-late disruption (3k-9), shared by the journey check
 * (`POST /v1/trips/{id}/journey-check`) and a member's own "running late" report. One open
 * disruption per plan item (`late:<stable id>`): a second late member joins the first one's. Only
 * minutes and clock times are kept; where the member was is never written anywhere.
 * Everything here runs as app_system inside the caller's transaction.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import { channelName, joinNames, type JourneyMode } from '@cp/domain';
import { arriveEarlyMinutes, localTime } from '@cp/planner';
import type pg from 'pg';

const MIN = 60_000;
/** A change in lateness smaller than this keeps the options as they are. */
const REWORK_MIN = 5;

export interface LateItem {
  readonly id: string;
  readonly stable_id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly title: string;
  readonly tz: string;
  readonly starts_at: Date;
  readonly category: string | null;
  /** The place's position, when the item has one. */
  readonly lat: number | null;
  readonly lng: number | null;
  /** Who goes: the item's own list, or everyone on the trip. */
  readonly attendee_ids: string[];
}

/** The item on the trip's current plan, as the caller may read it (RLS: a trip member). */
export async function lateItem(
  tx: pg.PoolClient,
  tripId: string,
  itemId: string,
): Promise<LateItem | undefined> {
  const { rows } = await tx.query<LateItem>(
    `SELECT i.id, i.stable_id, i.trip_id, t.crew_id, i.starts_at, i.category, p.lat, p.lng,
            left(coalesce(p.name, i.notes, initcap(i.category), 'Plan'), 60) AS title,
            coalesce(i.tz, t.tz, d.tz, 'UTC') AS tz,
            CASE WHEN cardinality(i.attendee_ids) > 0 THEN i.attendee_ids
                 ELSE ARRAY(SELECT tp.user_id FROM trip_participants tp
                             WHERE tp.trip_id = t.id AND tp.rsvp NOT IN ('out', 'waitlisted')
                             ORDER BY tp.user_id)
            END AS attendee_ids
       FROM plan_items i
       JOIN trips t ON t.id = i.trip_id AND t.current_version_id = i.version_id
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN pois p ON p.id = i.poi_id
      WHERE i.id = $1 AND i.trip_id = $2 AND i.starts_at IS NOT NULL`,
    [itemId, tripId],
  );
  return rows[0];
}

/** When to be there: the start, or check-in time for a flight. */
export function beThereAt(item: Pick<LateItem, 'starts_at' | 'category'>): Date {
  return new Date(item.starts_at.getTime() - arriveEarlyMinutes(item.category) * MIN);
}

export interface LateSighting {
  readonly uid: string;
  readonly lateMin: number;
  readonly etaAt: Date;
  readonly mode: JourneyMode | null;
  /** Minutes on foot from where the member is, when the router measured it. */
  readonly walkMin: number | null;
  readonly cause: 'traffic' | 'manual';
}

interface OpenLate {
  readonly id: string;
  readonly affected: { traveller_ids: string[]; unaffected_ids: string[] };
  readonly facts: Record<string, string | number>;
  /** `worked_late_min`: the lateness the options were last worked out for. */
  readonly source_snapshot: { worked_late_min?: number };
  readonly chosen_option_id: string | null;
}

const dedupeKey = (item: LateItem) => `late:${item.stable_id}`;

async function openLate(tx: pg.PoolClient, item: LateItem): Promise<OpenLate | undefined> {
  const { rows } = await tx.query<OpenLate>(
    `SELECT id, affected, facts, source_snapshot, chosen_option_id FROM disruptions
      WHERE trip_id = $1 AND dedupe_key = $2 AND status = 'open' FOR UPDATE`,
    [item.trip_id, dedupeKey(item)],
  );
  return rows[0];
}

async function words(
  tx: pg.PoolClient,
  item: LateItem,
  party: readonly string[],
  lateMin: number,
): Promise<{ title: string; summary: string }> {
  const { rows } = await tx.query<{ name: string }>(
    `SELECT coalesce(nullif(display_name, ''), 'Someone') AS name FROM users
      WHERE id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[], id)`,
    [party],
  );
  const names = rows.map((row) => row.name);
  const verb = names.length > 1 ? 'are' : 'is';
  return {
    title: `${item.title} · +${lateMin} min`,
    summary: `${joinNames(names)} ${verb} running ${lateMin} min late for ${item.title}.`,
  };
}

/**
 * Records that a member runs late for the item: opens the item's disruption, joins the open one,
 * or refreshes its ETA. The options are worked out again (the worker follows
 * `running_late.detected`) when the party or the lateness changed and nothing was chosen yet.
 */
export async function recordLate(
  tx: pg.PoolClient,
  item: LateItem,
  seen: LateSighting,
): Promise<{ disruptionId: string; opened: boolean }> {
  const check = {
    eta_at: seen.etaAt.toISOString(),
    late_min: seen.lateMin,
    mode: seen.mode,
    walk_min: seen.walkMin,
  };
  const open = await openLate(tx, item);
  const party = [...new Set([...(open?.affected.traveller_ids ?? []), seen.uid])];
  const waiting = item.attendee_ids.filter((id) => !party.includes(id)).sort();
  const affected = {
    traveller_ids: party,
    item_stable_ids: [item.stable_id],
    unaffected_ids: waiting,
  };
  const facts = {
    title: item.title,
    start: localTime(beThereAt(item), item.tz),
    eta: localTime(seen.etaAt, item.tz),
    late_min: seen.lateMin,
    ...(seen.mode === null ? {} : { mode: seen.mode }),
    ...(seen.walkMin === null ? {} : { walk_min: seen.walkMin }),
  };
  const copy = await words(tx, item, party, seen.lateMin);
  let disruptionId: string;
  let rework: boolean;
  if (open === undefined) {
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO disruptions (trip_id, kind, cause, dedupe_key, ref_kind, ref_id, title, summary,
         affected, facts, source_snapshot)
       VALUES ($1, 'running_late', $2, $3, 'plan_item', $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        item.trip_id,
        seen.cause,
        dedupeKey(item),
        item.id,
        copy.title,
        copy.summary,
        JSON.stringify(affected),
        JSON.stringify(facts),
        JSON.stringify({
          item_id: item.id,
          worked_late_min: seen.lateMin,
          checks: { [seen.uid]: check },
        }),
      ],
    );
    disruptionId = inserted.rows[0]?.id ?? '';
    rework = true;
  } else {
    disruptionId = open.id;
    const joined = !open.affected.traveller_ids.includes(seen.uid);
    const worked = open.source_snapshot.worked_late_min ?? Number(open.facts['late_min'] ?? 0);
    const moved = Math.abs(worked - seen.lateMin) >= REWORK_MIN;
    rework = joined || (moved && open.chosen_option_id === null);
    await tx.query(
      // The summary is the guide's line once the options are worked out: only the title follows.
      `UPDATE disruptions SET affected = $2, facts = $3::jsonb, title = $4,
              ref_id = $5, version = version + $6,
              source_snapshot = jsonb_set(
                source_snapshot || jsonb_build_object('item_id', $5::text)
                  || CASE WHEN $6 = 1 THEN jsonb_build_object('worked_late_min', $9::int)
                          ELSE '{}'::jsonb END,
                ARRAY['checks', $7::text], $8::jsonb, true)
        WHERE id = $1`,
      [
        open.id,
        JSON.stringify(affected),
        JSON.stringify(facts),
        copy.title,
        item.id,
        rework ? 1 : 0,
        seen.uid,
        JSON.stringify(check),
        seen.lateMin,
      ],
    );
  }
  await outbox(tx, channelName('trip_watch', item.trip_id), 'late.eta', {
    disruption_id: disruptionId,
    late_min: seen.lateMin,
    eta_at: check.eta_at,
  });
  if (rework) {
    await appendDomainEvent(tx, {
      type: 'running_late.detected',
      aggregateKind: 'trip',
      aggregateId: item.trip_id,
      actorKind: 'user',
      actorId: seen.uid,
      crewId: item.crew_id,
      tripId: item.trip_id,
      payload: {
        trip_id: item.trip_id,
        disruption_id: disruptionId,
        plan_item_id: item.id,
        late_min: seen.lateMin,
      },
    });
  }
  return { disruptionId, opened: open === undefined };
}

/**
 * A member is on time again: they leave the item's late party, and the disruption resolves when
 * nobody is left in it. Returns whether the member's own lateness ended here.
 */
export async function clearLate(tx: pg.PoolClient, item: LateItem, uid: string): Promise<boolean> {
  const open = await openLate(tx, item);
  if (open === undefined || !open.affected.traveller_ids.includes(uid)) return false;
  const party = open.affected.traveller_ids.filter((id) => id !== uid);
  if (party.length === 0) {
    await tx.query(
      `UPDATE disruptions SET status = 'resolved', resolved_at = now(), version = version + 1
        WHERE id = $1`,
      [open.id],
    );
    await appendDomainEvent(tx, {
      type: 'disruption.resolved',
      aggregateKind: 'trip',
      aggregateId: item.trip_id,
      actorKind: 'system',
      actorId: null,
      crewId: item.crew_id,
      tripId: item.trip_id,
      payload: { trip_id: item.trip_id, disruption_id: open.id, status: 'resolved' },
    });
  } else {
    const waiting = item.attendee_ids.filter((id) => !party.includes(id)).sort();
    const copy = await words(tx, item, party, Number(open.facts['late_min'] ?? 0));
    await tx.query(
      `UPDATE disruptions SET affected = $2, title = $3, version = version + 1,
              source_snapshot = source_snapshot #- ARRAY['checks', $4::text]
        WHERE id = $1`,
      [
        open.id,
        JSON.stringify({
          traveller_ids: party,
          item_stable_ids: [item.stable_id],
          unaffected_ids: waiting,
        }),
        copy.title,
        uid,
      ],
    );
  }
  await outbox(tx, channelName('trip_watch', item.trip_id), 'disruption.step', {
    disruption_id: open.id,
    action_id: 'late_party',
    state: party.length === 0 ? 'resolved' : 'updated',
  });
  return true;
}
