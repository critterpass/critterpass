/**
 * `GET /v1/trips/{id}/live-snapshot` (docs/api-contracts.md §5.5): the crew live map's initial
 * state and reconnect recovery, since `trip_locations:` keeps no history for positions. Returns the
 * latest fix of every open, non-paused crew-map share (read through `app.shared_location_fixes`,
 * the same ACL as the channel), every open share with its pause state, the meet-up and its ETAs.
 * Same gate as the channel: a participant while the crew map is open. An unboosted trip answers
 * `ENTITLEMENT_REQUIRED`, a boosted one outside trip days `NOT_ELIGIBLE`.
 */
import { withUser } from '@cp/db';
import { decodeMemberStatus, liveSnapshotSchema, type LiveSnapshot } from '@cp/domain';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import {
  ErrorBodySchema,
  validationHook,
  type CommandDoorDeps,
} from '../commands/_framework/doors';
import { requireCommandSession } from '../commands/_framework/session';
import {
  activeMeetup,
  requireCrewMapOpen,
  requireTripParticipant,
} from '../commands/live-map/shared';

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorBodySchema } },
});

const liveSnapshotRoute = createRoute({
  method: 'get',
  path: '/v1/trips/{id}/live-snapshot',
  tags: ['location'],
  summary: 'Crew live map state: latest fixes, shares, meet-up and ETAs',
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: 'The snapshot',
      content: { 'application/json': { schema: liveSnapshotSchema } },
    },
    401: errorResponse('AUTH_REQUIRED'),
    402: errorResponse('ENTITLEMENT_REQUIRED: the trip is not boosted'),
    403: errorResponse('NOT_ELIGIBLE: not on the trip, or outside trip days'),
  },
});

interface ShareRow {
  id: string;
  user_id: string;
  paused: boolean;
  updated_at: Date;
}

interface FixRow {
  user_id: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  activity: string;
  at: Date;
}

interface EtaRow {
  user_id: string;
  eta_min: number | null;
  distance_m: number | null;
  mode: 'pedestrian' | 'motor_scooter' | 'auto' | 'multimodal' | null;
  estimate: boolean;
  status_text: string | null;
  arrived: boolean;
}

export async function readLiveSnapshot(tx: pg.PoolClient, tripId: string): Promise<LiveSnapshot> {
  const shares = await tx.query<ShareRow>(
    `SELECT id, user_id, paused, updated_at FROM location_shares
      WHERE trip_id = $1 AND reason = 'crew_map'
        AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
      ORDER BY user_id`,
    [tripId],
  );
  const members: LiveSnapshot['members'] = [];
  for (const share of shares.rows) {
    if (share.paused) continue;
    const fix = await tx.query<FixRow>('SELECT * FROM app.shared_location_fixes($1, 1)', [
      share.id,
    ]);
    const row = fix.rows[0];
    if (row === undefined) continue;
    members.push({
      uid: row.user_id,
      lat: row.lat,
      lng: row.lng,
      acc: row.accuracy_m,
      at: row.at.toISOString(),
      activity: row.activity as LiveSnapshot['members'][number]['activity'],
    });
  }
  const meetup = await activeMeetup(tx, tripId);
  let etas: LiveSnapshot['etas'] = [];
  if (meetup !== null) {
    const { rows } = await tx.query<EtaRow>(
      `SELECT user_id, eta_min, distance_m, mode, estimate, status_text,
              $2::jsonb ? user_id::text AS arrived
         FROM member_etas WHERE trip_id = $1 AND meetup_id = $3 ORDER BY user_id`,
      [tripId, JSON.stringify(meetup.arrived), meetup.id],
    );
    etas = rows.map((row) => {
      const status = decodeMemberStatus(row.status_text, row.distance_m);
      return {
        uid: row.user_id,
        min: row.eta_min,
        distance_m: row.distance_m,
        mode: row.mode,
        estimate: row.estimate,
        status: { key: status.key, poi: status.poi, distance_m: status.distanceM },
        arrived: row.arrived,
      };
    });
  }
  const end = await tx.query<{ end_at: Date | null }>(
    'SELECT app.crew_map_window_end($1) AS end_at',
    [tripId],
  );
  return {
    trip_id: tripId,
    window_ends_at: end.rows[0]?.end_at?.toISOString() ?? null,
    members,
    shares: shares.rows.map((share) => ({
      uid: share.user_id,
      share_id: share.id,
      paused: share.paused,
      changed_at: share.updated_at.toISOString(),
    })),
    etas,
    meetup,
  };
}

export function registerLiveMapRoutes(app: OpenAPIHono<AppEnv>, deps: CommandDoorDeps): void {
  app.openapi(
    liveSnapshotRoute,
    async (c) => {
      const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
      const tripId = c.req.valid('param').id;
      const snapshot = await withUser(deps.pool, session.uid, '', async (tx) => {
        await requireTripParticipant(tx, tripId, session.uid);
        await requireCrewMapOpen(tx, tripId, session.uid, 'UTC');
        return readLiveSnapshot(tx, tripId);
      });
      return c.json(snapshot, 200);
    },
    validationHook,
  );
}
