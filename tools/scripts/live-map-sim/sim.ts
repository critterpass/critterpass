/**
 * Crew live map simulator: four crewmates (Maya and Rin walking together from Karsa Spa, Alex from
 * Warung Pondok, Jordan on a scooter from the east) turn sharing on, set a meet-up at Campuhan
 * Ridge and post a fix every 5 s along their GPX tracks through `POST /v1/loc`.
 *
 *   pnpm tsx tools/scripts/live-map-sim/sim.ts --check
 *       Self-contained stack (./stack.ts). Asserts ETAs recount every 60 ± 5 s, "everyone is close"
 *       fires once, and at the (fast-forwarded) window end every share is announced as ended and
 *       every participant is unsubscribed from trip_locations.
 *   pnpm tsx tools/scripts/live-map-sim/sim.ts --api http://localhost:8787 --db <owner url> \
 *       [--join <uid>] [--speed 4] [--minutes 10]
 *       Drives a running stack; `--join` adds an existing user (a device) to the crew and both trips.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

import { generateUuidV7 } from '@cp/domain';
import pg from 'pg';

import { CAMPUHAN_RIDGE, crewMembers, pointAlong, trackLength, type SimMember } from './routes';
import { seedLiveMapCrew, type SeededCrew } from './seed';
import { startSimStack, type Http } from './stack';

const TICK_MS = 5000;
const log = (line: string) => process.stdout.write(`${line}\n`);

interface Session {
  readonly uid: string;
  readonly cookie: string;
}

async function signIn(http: Http): Promise<Session> {
  const response = await http('/api/auth/sign-in/anonymous', { method: 'POST', body: '{}' });
  const cookie = /better-auth\.session_token=[^;]+/.exec(
    response.headers.get('set-cookie') ?? '',
  )?.[0];
  const body = (await response.json()) as { user?: { id: string } };
  if (cookie === undefined || body.user === undefined) {
    throw new Error(`anonymous sign-in failed: HTTP ${response.status}`);
  }
  return { uid: body.user.id, cookie };
}

async function command(
  http: Http,
  who: Session,
  cmd: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  const response = await http(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify({
      op_id: generateUuidV7(),
      cmd,
      v: 1,
      actor: { uid: who.uid, via: 'app' },
      device: { id: randomUUID(), platform: 'ios', app_version: '1.0.0', tz: 'Asia/Makassar' },
      client_ts: new Date().toISOString(),
      payload,
    }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(`${cmd}: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body['result'] as Record<string, unknown>;
}

interface Rider {
  readonly member: SimMember;
  readonly session: Session;
  readonly shareId: string;
}

export interface SimRun {
  readonly crew: SeededCrew;
  readonly riders: readonly Rider[];
  readonly meetupId: string;
  stop(): Promise<void>;
}

/** Signs the crew in, seeds the trips, turns sharing on, sets the meet-up and starts moving. */
export async function startCrew(
  http: Http,
  pool: pg.Pool,
  options: { readonly speed: number; readonly join?: string },
): Promise<SimRun> {
  const members = crewMembers();
  const signedIn = await Promise.all(
    members.map(async (member) => ({ member, session: await signIn(http) })),
  );
  const crew = await seedLiveMapCrew(pool, [
    ...signedIn.map(({ member, session }) => ({ uid: session.uid, name: member.name })),
    ...(options.join === undefined ? [] : [{ uid: options.join, name: 'You' }]),
  ]);
  log(`seeded crew ${crew.crewId}: boosted trip ${crew.boostedTripId}`);
  const riders: Rider[] = [];
  for (const { member, session } of signedIn) {
    const share = await command(http, session, 'set_location_share', {
      trip_id: crew.boostedTripId,
      status: 'on',
    });
    riders.push({ member, session, shareId: share['share_id'] as string });
  }
  const meetAt = new Date(Date.now() + 20 * 60_000);
  const organiser = signedIn[0]?.session;
  if (organiser === undefined) throw new Error('the sim crew is empty');
  const meetup = await command(http, organiser, 'create_meetup', {
    trip_id: crew.boostedTripId,
    poi_id: crew.poiId,
    at: meetAt.toISOString(),
  });
  log(`meet-up ${meetup['id'] as string} at ${CAMPUHAN_RIDGE.name}`);

  const started = Date.now();
  const tick = async () => {
    const elapsedS = (Date.now() - started) / 1000;
    await Promise.all(
      riders.map(async (rider) => {
        const travelled = rider.member.speedMps * options.speed * elapsedS;
        const done = travelled >= trackLength(rider.member.track);
        const at = pointAlong(rider.member.track, travelled);
        const response = await http('/v1/loc', {
          method: 'POST',
          headers: { cookie: rider.session.cookie },
          body: JSON.stringify({
            share_id: rider.shareId,
            fixes: [
              {
                lat: at.lat,
                lng: at.lng,
                acc: 8,
                activity: done ? 'stationary' : rider.member.activity,
                at: new Date().toISOString(),
                mock: 0,
              },
            ],
          }),
        });
        if (response.status !== 202 && response.status !== 429 && response.status !== 403) {
          log(`fix for ${rider.member.name}: HTTP ${response.status}`);
        }
      }),
    );
  };
  await tick();
  const timer = setInterval(() => void tick(), TICK_MS);
  return {
    crew,
    riders,
    meetupId: meetup['id'] as string,
    stop: () => {
      clearInterval(timer);
      return Promise.resolve();
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function check(): Promise<void> {
  const stack = await startSimStack(log);
  let failed = false;
  const expect = (ok: boolean, what: string) => {
    log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
    if (!ok) failed = true;
  };
  try {
    const run = await startCrew(stack.http, stack.pool, { speed: 8 });
    const runs: number[] = [];
    const deadline = Date.now() + 6 * 60_000;
    while (runs.length < 4 && Date.now() < deadline) {
      const { rows } = await stack.pool.query<{ at: Date | null }>(
        'SELECT max(computed_at) AS at FROM member_etas WHERE meetup_id = $1',
        [run.meetupId],
      );
      const at = rows[0]?.at?.getTime();
      if (at !== undefined && runs.at(-1) !== at) {
        runs.push(at);
        log(`eta run ${runs.length} at +${Math.round((at - (runs[0] ?? at)) / 1000)} s`);
      }
      await sleep(1000);
    }
    const gaps = runs.slice(1).map((at, i) => (at - (runs[i] ?? at)) / 1000);
    expect(
      runs.length >= 4 && gaps.every((gap) => gap >= 55 && gap <= 65),
      `ETAs recount every 60 ± 5 s (gaps ${gaps.map((g) => g.toFixed(1)).join(', ')} s)`,
    );
    const close = await stack.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'meetup.crew_close' AND aggregate_id = $1",
      [run.meetupId],
    );
    expect(close.rows.length === 1, 'everyone-is-close fires once');
    const viewer = run.riders[1]?.session.cookie ?? '';
    const etas = await stack.http(`/v1/trips/${run.crew.boostedTripId}/live-snapshot`, {
      headers: { cookie: viewer },
    });
    const snapshot = (await etas.json()) as { members: unknown[] };
    expect(snapshot.members.length === 4, 'the live snapshot shows all four sharing members');
    await run.stop();

    // Fast-forward to the window end: the last day was yesterday and every share ends now.
    await stack.pool.query(
      `UPDATE trips SET start_date = start_date - 3, end_date = end_date - 3 WHERE id = $1`,
      [run.crew.boostedTripId],
    );
    await stack.pool.query(
      `UPDATE location_shares SET ends_at = now() + interval '2 seconds' WHERE trip_id = $1`,
      [run.crew.boostedTripId],
    );
    await stack.pool.query(
      `UPDATE scheduled_events SET due_at = now() + interval '2 seconds'
        WHERE kind = 'location.expire' AND ref_id IN (SELECT id FROM location_shares WHERE trip_id = $1)`,
      [run.crew.boostedTripId],
    );
    let ended = 0;
    let unsubscribed = 0;
    for (let i = 0; i < 90 && (ended < 4 || unsubscribed < 4); i++) {
      await sleep(1000);
      const { rows } = await stack.pool.query<{ ended: number; unsubscribed: number }>(
        `SELECT count(*) FILTER (WHERE kind = 'publish' AND payload->>'type' = 'share.ended')::int AS ended,
                count(DISTINCT payload->>'user_id') FILTER (WHERE kind = 'unsubscribe')::int AS unsubscribed
           FROM rt_outbox WHERE channel = 'trip_locations:' || $1`,
        [run.crew.boostedTripId],
      );
      ended = rows[0]?.ended ?? 0;
      unsubscribed = rows[0]?.unsubscribed ?? 0;
    }
    expect(ended === 4, `every share announced its end at the window end (${ended})`);
    expect(
      unsubscribed >= 4,
      `every participant unsubscribed from trip_locations (${unsubscribed})`,
    );
  } finally {
    await stack.stop();
  }
  if (failed) process.exit(1);
}

async function drive(args: {
  api: string;
  db: string;
  join?: string;
  speed: number;
  minutes: number;
}): Promise<void> {
  const pool = new pg.Pool({ connectionString: args.db, max: 2 });
  const http: Http = (path, init = {}) => {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    return fetch(`${args.api.replace(/\/+$/, '')}${path}`, { ...init, headers });
  };
  const run = await startCrew(http, pool, {
    speed: args.speed,
    ...(args.join === undefined ? {} : { join: args.join }),
  });
  await sleep(args.minutes * 60_000);
  await run.stop();
  await pool.end();
}

const { values } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    api: { type: 'string' },
    db: { type: 'string' },
    join: { type: 'string' },
    speed: { type: 'string', default: '4' },
    minutes: { type: 'string', default: '10' },
  },
});

if (values.check) {
  await check();
} else if (values.api !== undefined && values.db !== undefined) {
  await drive({
    api: values.api,
    db: values.db,
    ...(values.join === undefined ? {} : { join: values.join }),
    speed: Number(values.speed),
    minutes: Number(values.minutes),
  });
} else {
  log(
    'usage: sim.ts --check | --api <url> --db <owner url> [--join <uid>] [--speed n] [--minutes n]',
  );
  process.exit(2);
}
