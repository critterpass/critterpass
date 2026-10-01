/**
 * `sos.responder_eta`: while crewmates are on their way to an SOS, every minute, their walking ETA
 * to the sender from both latest fixes (Valhalla pedestrian when configured, a straight-line
 * "about" otherwise). Each count updates the responder's row on the incident and is hinted on
 * `sos:{id}` ("Alex is going. 4 minutes away on foot."); within 50 m they have arrived. The chain
 * stops once everyone coming has arrived or the incident is no longer open.
 */
import { outbox, sendInTx, withSystem } from '@cp/db';
import {
  SAFETY_QUEUES,
  SOS_ARRIVED_WITHIN_M,
  SOS_ETA_EVERY_S,
  sosChannel,
  sosJobSchema,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import type { MeetupRouter, RoutePoint } from '../live-map/meetup-router';

/** Fixes older than this no longer place anyone. */
const FIX_FRESH_MS = 10 * 60_000;

interface Coming {
  uid: string;
  share_id: string;
}

async function latestFix(
  tx: pg.PoolClient,
  shareId: string,
  now: Date,
): Promise<RoutePoint | null> {
  const { rows } = await tx.query<{ lat: number; lng: number }>(
    `SELECT lat, lng FROM location_fixes WHERE share_id = $1 AND at > $2 ORDER BY at DESC LIMIT 1`,
    [shareId, new Date(now.getTime() - FIX_FRESH_MS)],
  );
  return rows[0] ?? null;
}

export interface EtaCount {
  readonly uid: string;
  readonly eta_min: number;
  readonly distance_m: number;
  readonly estimate: boolean;
  readonly arrived: boolean;
}

export function recountResponderEtas(
  pool: pg.Pool,
  sosId: string,
  router: MeetupRouter,
  now: Date = new Date(),
): Promise<{ readonly etas: readonly EtaCount[]; readonly reschedule: boolean }> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ status: string }>(
      "SELECT status FROM help_sessions WHERE id = $1 AND kind = 'sos' FOR UPDATE",
      [sosId],
    );
    if (rows[0]?.status !== 'responding') return { etas: [], reschedule: false };
    const coming = await tx.query<Coming>(
      `SELECT key AS uid, value ->> 'share_id' AS share_id
         FROM help_sessions s, jsonb_each(s.responses)
        WHERE s.id = $1 AND value ->> 'state' = 'coming' AND value ? 'share_id'
          AND NOT value ? 'arrived_at'
        ORDER BY key`,
      [sosId],
    );
    if (coming.rows.length === 0) return { etas: [], reschedule: false };
    const target = await latestFix(tx, sosId, now);
    const placed: { uid: string; at: RoutePoint }[] = [];
    for (const row of coming.rows) {
      const at = await latestFix(tx, row.share_id, now);
      if (at !== null) placed.push({ uid: row.uid, at });
    }
    const etas: EtaCount[] = [];
    if (target !== null && placed.length > 0) {
      const cells = await router.matrix(
        'pedestrian',
        placed.map((p) => p.at),
        target,
      );
      for (const [index, person] of placed.entries()) {
        const cell = cells[index];
        if (cell === undefined) continue;
        const arrived = cell.distanceM <= SOS_ARRIVED_WITHIN_M;
        const count: EtaCount = {
          uid: person.uid,
          eta_min: arrived ? 0 : Math.max(1, Math.round(cell.minutes)),
          distance_m: Math.round(cell.distanceM),
          estimate: cell.estimate,
          arrived,
        };
        etas.push(count);
        const patch = {
          eta_min: count.eta_min,
          distance_m: count.distance_m,
          estimate: count.estimate,
          ...(arrived ? { arrived_at: now.toISOString() } : {}),
        };
        await tx.query(
          `UPDATE help_sessions SET responses = jsonb_set(responses, ARRAY[$2::text],
                  responses -> $2::text || $3::jsonb)
            WHERE id = $1`,
          [sosId, person.uid, JSON.stringify(patch)],
        );
        await outbox(tx, sosChannel(sosId), 'responder', {
          uid: person.uid,
          state: 'coming',
          ...patch,
          lat: person.at.lat,
          lng: person.at.lng,
        });
      }
    }
    const reschedule = coming.rows.length > etas.filter((eta) => eta.arrived).length;
    if (reschedule) {
      const next = new Date(now.getTime() + SOS_ETA_EVERY_S * 1000);
      await sendInTx(
        tx,
        SAFETY_QUEUES.sosResponderEta,
        { sos_id: sosId },
        { startAfter: next, singletonKey: `${sosId}:${Math.floor(next.getTime() / 60_000)}` },
      );
    }
    return { etas, reschedule };
  });
}

export function sosResponderEtaJob(router: MeetupRouter): AnyJobDefinition {
  return defineJob({
    queue: SAFETY_QUEUES.sosResponderEta,
    schema: sosJobSchema,
    async handler(data, { pool }) {
      const result = await recountResponderEtas(pool, data.sos_id, router);
      return { counted: result.etas.length, reschedule: result.reschedule };
    },
  });
}
