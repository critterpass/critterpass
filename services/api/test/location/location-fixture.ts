/**
 * A signed-in traveller on a trip with a destination and two POIs (one in the trip's destination,
 * one elsewhere), for the location and visit suites.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';

import type { CommandDoorsHarness, SignedIn } from '../routes/command-doors-harness';

export interface LocationFixture {
  readonly traveller: SignedIn;
  readonly crewmate: SignedIn;
  readonly tripId: string;
  readonly poiId: string;
  readonly elsewherePoiId: string;
}

export async function buildLocationFixture(harness: CommandDoorsHarness): Promise<LocationFixture> {
  const traveller = await harness.signInAnonymously();
  const crewmate = await harness.signInAnonymously();
  const ids = await withSystem(harness.pool, async (tx) => {
    const slug = `loc-${randomUUID().slice(0, 8)}`;
    const dest = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ($1, $1), ($1 || '-b', $1) RETURNING id",
      [slug],
    );
    const [here, there] = dest.rows.map((row) => row.id);
    const crew = await tx.query<{ id: string }>(
      "INSERT INTO crews (name, created_by) VALUES ('Loc', $1) RETURNING id",
      [traveller.uid],
    );
    const crewId = crew.rows[0]!.id;
    await tx.query(
      `INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser'), ($1, $3, 'member')`,
      [crewId, traveller.uid, crewmate.uid],
    );
    const trip = await tx.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'voting', $2) RETURNING id",
      [crewId, here],
    );
    const tripId = trip.rows[0]!.id;
    await tx.query(
      `INSERT INTO trip_participants (trip_id, user_id, role, rsvp)
       VALUES ($1, $2, 'organiser', 'in'), ($1, $3, 'member', 'in')`,
      [tripId, traveller.uid, crewmate.uid],
    );
    const pois = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Warung', 'food', -8.5, 115.26), ($2, 'Elsewhere', 'food', 35.0, 135.7) RETURNING id`,
      [here, there],
    );
    return { tripId, poiId: pois.rows[0]!.id, elsewherePoiId: pois.rows[1]!.id };
  });
  return { traveller, crewmate, ...ids };
}

/** Runs one command for `session` through `/v1/cmd`, returning status and body. */
export async function runCommand(
  harness: CommandDoorsHarness,
  session: SignedIn,
  cmd: string,
  payload: unknown,
  opts: { opId?: string; deviceId?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const op = {
    op_id: opts.opId ?? generateUuidV7(),
    cmd,
    v: 1,
    actor: { uid: session.uid, via: 'app' },
    device: {
      id: opts.deviceId ?? randomUUID(),
      platform: 'ios',
      app_version: '1.0.0',
      tz: 'Asia/Makassar',
    },
    client_ts: new Date().toISOString(),
    payload,
  };
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(op),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}
