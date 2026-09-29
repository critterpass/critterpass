/**
 * `eta.meetups` (docs/api-contracts-async.md §2.3): every 60 s per active meet-up while at least
 * one crew-map share is live. Latest fix per sharing member → the ETA matrix (mode by activity) →
 * `member_etas` → an `eta` publication on `trip_locations:`. Members within 75 m are marked
 * arrived; the first time every sharing member is under 5 minutes, `meetup.crew_close` fires
 * (the pin pulses, one push). The chain stops when the meet-up ends, the map closes or nobody is
 * sharing; a new share, a resume or a move re-arms it. Two chains for one meet-up converge: a run
 * finding ETAs younger than 50 s stops without rescheduling.
 */
import { appendDomainEvent, outbox, withSystem } from '@cp/db';
import {
  ARRIVAL_RADIUS_M,
  crewMapChannel,
  distanceM,
  encodeMemberStatus,
  memberStatus,
  STATUS_POI_RADIUS_M,
  type LocationActivity,
  type MemberEtaWire,
  type TravelMode,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import type { MeetupRouter, RoutePoint } from './meetup-router';

export const ETA_MEETUPS_QUEUE = 'eta.meetups';
export const ETA_INTERVAL_S = 60;
/** A run finding ETAs younger than this for an unmoved meet-up leaves the work to the other chain. */
const FRESH_MS = 50_000;
export const ALL_CLOSE_MIN = 5;
/** A meet-up this long past its time is over. */
const MEETUP_GRACE_MS = 3 * 3600_000;
const FIX_MAX_AGE_MS = 15 * 60_000;

interface MeetupRow {
  id: string;
  trip_id: string;
  lat: number;
  lng: number;
  meet_at: Date;
  status: string;
  arrived: Record<string, string>;
  all_close_at: Date | null;
  open: boolean;
}

interface LiveMember {
  user_id: string;
  lat: number;
  lng: number;
  activity: LocationActivity;
}

export function modeFor(activity: LocationActivity): TravelMode {
  if (activity === 'automotive') return 'auto';
  if (activity === 'cycling') return 'motor_scooter';
  return 'pedestrian';
}

async function nearestPoiName(tx: pg.PoolClient, at: RoutePoint): Promise<string | null> {
  // ~0.001° ≈ 110 m: a cheap box first, then the exact distance.
  const { rows } = await tx.query<{ name: string; lat: number; lng: number }>(
    `SELECT name, lat, lng FROM pois
      WHERE status = 'active' AND lat BETWEEN $1 - 0.001 AND $1 + 0.001
        AND lng BETWEEN $2 - 0.001 AND $2 + 0.001`,
    [at.lat, at.lng],
  );
  let best: { name: string; d: number } | null = null;
  for (const row of rows) {
    const d = distanceM(at, row);
    if (d <= STATUS_POI_RADIUS_M && (best === null || d < best.d)) best = { name: row.name, d };
  }
  return best?.name ?? null;
}

export interface RecountResult {
  readonly reschedule: boolean;
  readonly etas: readonly MemberEtaWire[];
  readonly allClose: boolean;
}

const STOP: RecountResult = { reschedule: false, etas: [], allClose: false };

export async function recountMeetupEtas(
  pool: pg.Pool,
  meetupId: string,
  router: MeetupRouter,
  now: Date = new Date(),
): Promise<RecountResult> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<MeetupRow>(
      `SELECT id, trip_id, lat, lng, meet_at, status, arrived, all_close_at,
              app.crew_map_open(trip_id) AS open
         FROM meetups WHERE id = $1 FOR UPDATE`,
      [meetupId],
    );
    const meetup = rows[0];
    if (meetup?.status !== 'active') return STOP;
    if (!meetup.open || now.getTime() > meetup.meet_at.getTime() + MEETUP_GRACE_MS) {
      await tx.query("UPDATE meetups SET status = 'done' WHERE id = $1", [meetupId]);
      return STOP;
    }
    // A move deletes the meet-up's ETAs (app.reset_meetup_arrivals), so it is never "fresh".
    const fresh = await tx.query<{ fresh: boolean }>(
      `SELECT coalesce(max(computed_at) > $2::timestamptz - make_interval(secs => $3), false)
                AS fresh
         FROM member_etas WHERE meetup_id = $1`,
      [meetupId, now.toISOString(), FRESH_MS / 1000],
    );
    if (fresh.rows[0]?.fresh === true) return STOP;

    const live = await tx.query<LiveMember>(
      `SELECT DISTINCT ON (s.user_id) s.user_id, f.lat, f.lng, f.activity
         FROM location_shares s
         JOIN location_fixes f ON f.share_id = s.id
        WHERE s.trip_id = $1 AND s.reason = 'crew_map' AND NOT s.paused
          AND s.starts_at <= $2 AND (s.ends_at IS NULL OR s.ends_at > $2)
          AND f.at > $2::timestamptz - make_interval(secs => $3)
        ORDER BY s.user_id, f.at DESC`,
      [meetup.trip_id, now.toISOString(), FIX_MAX_AGE_MS / 1000],
    );
    if (live.rows.length === 0) return STOP;

    const byMode = new Map<TravelMode, LiveMember[]>();
    for (const member of live.rows) {
      const mode = modeFor(member.activity);
      byMode.set(mode, [...(byMode.get(mode) ?? []), member]);
    }
    const arrived: Record<string, string> = { ...meetup.arrived };
    const etas: MemberEtaWire[] = [];
    for (const [mode, members] of byMode) {
      const cells = await router.matrix(mode, members, meetup);
      for (const [index, member] of members.entries()) {
        const cell = cells[index];
        if (cell === undefined) continue;
        const straight = distanceM(member, meetup);
        if (straight <= ARRIVAL_RADIUS_M && arrived[member.user_id] === undefined) {
          arrived[member.user_id] = now.toISOString();
        }
        const isHere = arrived[member.user_id] !== undefined && straight <= ARRIVAL_RADIUS_M * 2;
        const status = memberStatus({
          activity: member.activity,
          poiName: await nearestPoiName(tx, member),
          meetupDistanceM: isHere ? straight : cell.distanceM,
        });
        const eta: MemberEtaWire = {
          uid: member.user_id,
          min: isHere ? 0 : cell.minutes,
          distance_m: isHere ? Math.round(straight) : cell.distanceM,
          mode,
          estimate: cell.estimate,
          status: { key: status.key, poi: status.poi, distance_m: status.distanceM },
          arrived: isHere,
        };
        etas.push(eta);
        await tx.query(
          `INSERT INTO member_etas (trip_id, meetup_id, user_id, distance_m, eta_min, mode, estimate,
                                    status_text, sharing, computed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'live', $9)
           ON CONFLICT (trip_id, user_id) DO UPDATE SET
             meetup_id = EXCLUDED.meetup_id, distance_m = EXCLUDED.distance_m,
             eta_min = EXCLUDED.eta_min, mode = EXCLUDED.mode, estimate = EXCLUDED.estimate,
             status_text = EXCLUDED.status_text, sharing = 'live', computed_at = EXCLUDED.computed_at`,
          [
            meetup.trip_id,
            meetupId,
            member.user_id,
            eta.distance_m,
            eta.min,
            mode,
            eta.estimate,
            encodeMemberStatus(status),
            now.toISOString(),
          ],
        );
      }
    }
    etas.sort((a, b) => a.uid.localeCompare(b.uid));

    const allClose = etas.every((eta) => eta.arrived || (eta.min ?? Infinity) < ALL_CLOSE_MIN);
    const firstAllClose = allClose && meetup.all_close_at === null;
    await tx.query(
      `UPDATE meetups SET arrived = $2::jsonb,
              all_close_at = CASE WHEN $3 THEN $4::timestamptz ELSE all_close_at END
        WHERE id = $1`,
      [meetupId, JSON.stringify(arrived), firstAllClose, now.toISOString()],
    );
    if (firstAllClose) {
      await appendDomainEvent(tx, {
        type: 'meetup.crew_close',
        aggregateKind: 'meetup',
        aggregateId: meetupId,
        actorKind: 'system',
        actorId: null,
        tripId: meetup.trip_id,
        payload: { trip_id: meetup.trip_id, meetup_id: meetupId },
      });
    }
    await outbox(tx, crewMapChannel(meetup.trip_id), 'eta', {
      meetup_id: meetupId,
      computed_at: now.toISOString(),
      all_close: allClose,
      etas,
    });
    return { reschedule: true, etas, allClose };
  });
}

const dataSchema = z.looseObject({
  meetup_id: z.uuid().optional(),
  /** Set when the run was fired by the meet-up's timer (`scheduled_events`). */
  ref_id: z.uuid().optional(),
});

export function etaMeetupsJob(router: MeetupRouter): AnyJobDefinition {
  return defineJob({
    queue: ETA_MEETUPS_QUEUE,
    schema: dataSchema,
    async handler(data, { pool, boss }) {
      const meetupId = data.meetup_id ?? data.ref_id;
      if (meetupId === undefined) return { skipped: 'no_meetup' };
      const result = await recountMeetupEtas(pool, meetupId, router);
      if (result.reschedule) {
        await boss.send(ETA_MEETUPS_QUEUE, { meetup_id: meetupId }, { startAfter: ETA_INTERVAL_S });
      }
      return { members: result.etas.length, all_close: result.allClose };
    },
  });
}
