/**
 * The comprehensive six-actor permission fixture (docs/system-architecture.md §5 permission
 * contract suite): outsider, ex-member, member, organiser, co-organiser and anonymous, layered
 * with one trip and one crew-visible plan version so every table this phase owns has a real,
 * visible row for packages/db/test/permissions/_matrix.ts to probe. "Anonymous" matches
 * ./actors.ts#anonymousActor: a uid with no backing row anywhere, not an unauthenticated
 * connection — every probe below still runs as the `app_user` role via `withUser`.
 */
import type pg from 'pg';

import { withSystem } from '../../src/tx';
import {
  anonymousActor,
  insertCrew,
  insertCrewMember,
  insertTrip,
  insertTripParticipant,
  insertUser,
  setCrewMemberStatus,
} from './actors';
import { claimOpId, recordCmdResult } from '../../src/events';
import {
  insertChangeSet,
  insertItineraryVersion,
  insertPlanDay,
  insertPlanItem,
} from './plan-actors';

export const ACTOR_KINDS = [
  'outsider',
  'exMember',
  'member',
  'organiser',
  'coOrganiser',
  'anonymous',
] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export interface PermissionFixture {
  readonly crewId: string;
  readonly tripId: string;
  readonly versionId: string;
  readonly dayId: string;
  /** Authored by `actors.member` — the natural target for a "does the author own this?" probe. */
  readonly changeSetId: string;
  readonly actors: Readonly<Record<ActorKind, string>>;
}

/**
 * Builds a crew of five real users plus one backing-row-free "anonymous" uid, seats
 * organiser/coOrganiser/member on one trip, and adds one row to every remaining table this phase
 * owns (plan version/day/item, change set, activity event, guide action, a member-owned
 * `cmd_results` row, and one public `client_config` entry) so a table-by-table SELECT sweep always
 * has something real to find or correctly fail to find.
 */
export async function buildPermissionFixture(pool: pg.Pool): Promise<PermissionFixture> {
  const anonymousUid = anonymousActor().uid;

  const built = await withSystem(pool, async (tx) => {
    const organiser = await insertUser(tx);
    const coOrganiser = await insertUser(tx);
    const member = await insertUser(tx);
    const exMember = await insertUser(tx);
    const outsider = await insertUser(tx);

    // Self-owned rows (RLS class O): only their own owner can ever select these, so the fixture
    // needs a real row on the organiser specifically for that probe to mean anything.
    await tx.query('INSERT INTO user_settings (user_id) VALUES ($1)', [organiser]);
    await tx.query("INSERT INTO consents (user_id, purpose) VALUES ($1, 'analytics')", [organiser]);

    // Catalogue content (RLS class R, read-all authenticated): the table must not be empty or a
    // probe cannot tell "denied" apart from "table has nothing in it yet".
    await tx.query(
      "INSERT INTO destinations (slug, name) VALUES ('matrix-probe-destination', 'Matrix Probe') ON CONFLICT (slug) DO NOTHING",
    );
    await tx.query(
      "INSERT INTO guides (slug, name, colour) VALUES ('matrix-probe-guide', 'Matrix Probe', 'yellow') ON CONFLICT (slug) DO NOTHING",
    );

    const crewId = await insertCrew(tx, { createdBy: organiser });
    await insertCrewMember(tx, { crewId, userId: organiser, role: 'organiser' });
    await insertCrewMember(tx, { crewId, userId: coOrganiser, role: 'organiser' });
    await insertCrewMember(tx, { crewId, userId: member, role: 'member' });
    // A real "used to be a member" row: joins active, then is removed — the same two-step
    // packages/db/test/permissions/crew_members.test.ts uses to prove the epoch/unsubscribe path.
    await insertCrewMember(tx, { crewId, userId: exMember, role: 'member' });
    await setCrewMemberStatus(tx, { crewId, userId: exMember, status: 'removed' });

    const tripId = await insertTrip(tx, { crewId, status: 'voting' });
    await insertTripParticipant(tx, { tripId, userId: organiser, role: 'organiser' });
    await insertTripParticipant(tx, { tripId, userId: coOrganiser, role: 'organiser' });
    await insertTripParticipant(tx, { tripId, userId: member, role: 'member' });

    const versionId = await insertItineraryVersion(tx, {
      tripId,
      visibility: 'crew',
      status: 'current',
    });
    const dayId = await insertPlanDay(tx, { versionId, tripId, dayNo: 1 });
    await insertPlanItem(tx, { versionId, dayId, tripId, category: 'breakfast' });
    const changeSetId = await insertChangeSet(tx, {
      tripId,
      baseVersionId: versionId,
      authorId: member,
      ops: [],
    });

    await tx.query(
      `INSERT INTO activity_events (id, trip_id, crew_id, actor_kind, verb, object_kind, text)
       VALUES (uuidv7(), $1, $2, 'user', 'joined', 'crew_member', 'activity.joined')`,
      [tripId, crewId],
    );
    await tx.query("INSERT INTO guide_actions (trip_id, kind) VALUES ($1, 'suggest_restaurant')", [
      tripId,
    ]);
    await tx.query(
      `INSERT INTO ops.ops_config (key, value, is_public) VALUES ('matrix.probe', '1'::jsonb, true)
       ON CONFLICT (key) DO UPDATE SET is_public = true`,
    );

    const opId = crypto.randomUUID();
    await claimOpId(tx, { opId, uid: member, cmd: 'matrix_probe', payloadHash: 'h' });
    await recordCmdResult(tx, { opId, uid: member, cmd: 'matrix_probe', status: 'applied' });

    return {
      crewId,
      tripId,
      versionId,
      dayId,
      changeSetId,
      organiser,
      coOrganiser,
      member,
      exMember,
      outsider,
    };
  });

  return {
    crewId: built.crewId,
    tripId: built.tripId,
    versionId: built.versionId,
    dayId: built.dayId,
    changeSetId: built.changeSetId,
    actors: {
      outsider: built.outsider,
      exMember: built.exMember,
      member: built.member,
      organiser: built.organiser,
      coOrganiser: built.coOrganiser,
      anonymous: anonymousUid,
    },
  };
}
