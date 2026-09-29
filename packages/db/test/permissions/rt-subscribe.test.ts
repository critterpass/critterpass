/**
 * Centrifugo subscribe-proxy decisions (docs/data-model.md §2 permission contract suite): every
 * fixture actor × every core realtime namespace, evaluated with the exact ACL predicate the api's
 * subscribe proxy runs (`RT_ACL_RULE_SQL`, as `app_user` with `app.uid` set).
 */
import {
  channelName,
  parseRtChannel,
  RT_ACL_RULE_SQL,
  RT_CORE_NAMESPACES,
  type RtAclRule,
} from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import {
  anonymousActor,
  insertCrewMember,
  insertTripParticipant,
  insertUser,
  setCrewMemberStatus,
} from '../helpers/actors';
import {
  ACTOR_KINDS,
  buildPermissionFixture,
  type ActorKind,
  type PermissionFixture,
} from '../helpers/fixtures';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
}, 240_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

async function canSubscribe(uid: string, channel: string): Promise<boolean> {
  const parsed = parseRtChannel(channel);
  const spec = RT_CORE_NAMESPACES.find((candidate) => candidate.name === parsed?.namespace);
  if (parsed === null || spec === undefined) return false;
  return withUser(db.pool, uid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<{ allowed: boolean | null }>(RT_ACL_RULE_SQL[spec.acl], [
      parsed.id,
    ]);
    return rows[0]?.allowed === true;
  });
}

/** Which fixture id a rule's channel is keyed by. */
function channelIdFor(rule: RtAclRule, f: PermissionFixture): string {
  switch (rule) {
    case 'self':
      return f.actors.organiser;
    case 'crew_member':
      return f.crewId;
    case 'trip_member':
    case 'trip_participant':
    case 'trip_organiser':
      return f.tripId;
  }
}

const ALLOWED: Readonly<Record<RtAclRule, readonly ActorKind[]>> = {
  self: ['organiser'],
  crew_member: ['member', 'organiser', 'coOrganiser'],
  trip_member: ['member', 'organiser', 'coOrganiser'],
  trip_participant: ['member', 'organiser', 'coOrganiser'],
  trip_organiser: ['organiser', 'coOrganiser'],
};

describe('subscribe matrix: actor × core namespace', () => {
  for (const spec of RT_CORE_NAMESPACES) {
    for (const actor of ACTOR_KINDS) {
      const expected = ALLOWED[spec.acl].includes(actor);
      it(`${spec.name}: ${actor} is ${expected ? 'allowed' : 'denied'}`, async () => {
        const channel = channelName(spec.name, channelIdFor(spec.acl, fixture));
        expect(await canSubscribe(fixture.actors[actor], channel)).toBe(expected);
      });
    }
  }
});

describe('subscribe edge cases', () => {
  it('lets every actor, anonymous included, subscribe to their own user channel', async () => {
    for (const actor of ACTOR_KINDS) {
      const uid = fixture.actors[actor];
      expect(await canSubscribe(uid, channelName('user', uid))).toBe(true);
    }
  });

  it('denies a namespace that is not registered and a malformed channel', async () => {
    expect(await canSubscribe(fixture.actors.member, `poll:${fixture.tripId}`)).toBe(false);
    expect(await canSubscribe(fixture.actors.member, `crew:not-a-uuid`)).toBe(false);
    expect(await canSubscribe(fixture.actors.member, `user:${fixture.actors.member}`)).toBe(false);
  });

  it('denies trip channels to a participant who answered out, but not to an organiser', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        "UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = $1 AND user_id = ANY($2)",
        [fixture.tripId, [fixture.actors.member, fixture.actors.coOrganiser]],
      ),
    );
    try {
      expect(
        await canSubscribe(fixture.actors.member, channelName('trip_plan', fixture.tripId)),
      ).toBe(false);
      expect(
        await canSubscribe(fixture.actors.coOrganiser, channelName('trip_plan', fixture.tripId)),
      ).toBe(true);
    } finally {
      await withSystem(db.pool, (tx) =>
        tx.query("UPDATE trip_participants SET rsvp = 'unopened' WHERE trip_id = $1", [
          fixture.tripId,
        ]),
      );
    }
  });

  it('lets a crew member with no participant row follow setup, and nobody outside the crew', async () => {
    const { tripId, crewId, actors } = fixture;
    const newcomer = await withSystem(db.pool, async (tx) => {
      const uid = await insertUser(tx);
      await insertCrewMember(tx, { crewId, userId: uid });
      return uid;
    });
    for (const namespace of ['trip_setup', 'trip_presence'] as const) {
      const channel = channelName(namespace, tripId);
      expect(await canSubscribe(newcomer, channel), namespace).toBe(true);
      expect(await canSubscribe(actors.outsider, channel), namespace).toBe(false);
      expect(await canSubscribe(actors.exMember, channel), namespace).toBe(false);
      expect(await canSubscribe(actors.anonymous, channel), namespace).toBe(false);
    }
    expect(await canSubscribe(newcomer, channelName('trip_plan', tripId))).toBe(false);
    await withSystem(db.pool, (tx) =>
      setCrewMemberStatus(tx, { crewId, userId: newcomer, status: 'removed' }),
    );
    for (const namespace of ['trip_setup', 'trip_presence'] as const) {
      expect(await canSubscribe(newcomer, channelName(namespace, tripId)), namespace).toBe(false);
    }
  });

  // Runs last: it removes the fixture's member for good.
  it('denies trip channels to a removed crew member who still holds a participant row', async () => {
    await withSystem(db.pool, async (tx) => {
      await insertTripParticipant(tx, { tripId: fixture.tripId, userId: fixture.actors.exMember });
    });
    expect(await canSubscribe(fixture.actors.exMember, channelName('trip', fixture.tripId))).toBe(
      false,
    );

    await withSystem(db.pool, (tx) =>
      setCrewMemberStatus(tx, {
        crewId: fixture.crewId,
        userId: fixture.actors.member,
        status: 'removed',
      }),
    );
    expect(await canSubscribe(fixture.actors.member, channelName('trip', fixture.tripId))).toBe(
      false,
    );
    expect(
      await canSubscribe(fixture.actors.member, channelName('crew_chat', fixture.crewId)),
    ).toBe(false);
  });
});
