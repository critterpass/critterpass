/**
 * `taste_profiles` (docs/data-model.md §3.1): crew-visible unless the owner hides their tags
 * (`user_settings.hide_taste_tags`), owner-written, and never readable by the guide except through
 * `llm.trip_context`, which carries the same crew-visible tags only.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import type { ActorKind } from '../helpers/fixtures';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let profileId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { rows } = await harness.db.pool.query<{ id: string }>(
    'SELECT id FROM taste_profiles WHERE user_id = $1',
    [harness.fixture.actors.organiser],
  );
  profileId = rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

function asUser<T>(uid: string, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  return withUser(harness.db.pool, uid, anonymousActor().device, fn);
}

async function setHidden(hidden: boolean): Promise<void> {
  const uid = harness.fixture.actors.organiser;
  await asUser(uid, (tx) =>
    tx.query('UPDATE user_settings SET hide_taste_tags = $2 WHERE user_id = $1', [uid, hidden]),
  );
}

async function visibleTo(actor: ActorKind): Promise<boolean> {
  return asUser(harness.fixture.actors[actor], async (tx) => {
    const { rows } = await tx.query('SELECT 1 FROM taste_profiles WHERE id = $1', [profileId]);
    return rows.length === 1;
  });
}

async function guideParticipantTags(): Promise<unknown> {
  const { fixture } = harness;
  return withGuideReader(harness.db.pool, fixture.actors.member, fixture.tripId, async (tx) => {
    const { rows } = await tx.query<{ participants: { user_id: string; taste_tags: unknown }[] }>(
      'SELECT participants FROM llm.trip_context',
    );
    return rows[0]?.participants.find((p) => p.user_id === fixture.actors.organiser)?.taste_tags;
  });
}

beforeEach(async () => {
  await setHidden(false);
});

describe('taste_profiles RLS', () => {
  it.each(['organiser', 'coOrganiser', 'member'] as const)(
    'shows crew-visible tags to the %s',
    async (actor) => {
      expect(await visibleTo(actor)).toBe(true);
    },
  );

  it.each(['outsider', 'exMember', 'anonymous'] as const)('hides them from the %s', async (a) => {
    expect(await visibleTo(a)).toBe(false);
  });

  it('hides hidden tags from crewmates but not from their owner, and shows them again', async () => {
    await setHidden(true);
    expect(await visibleTo('member')).toBe(false);
    expect(await visibleTo('coOrganiser')).toBe(false);
    expect(await visibleTo('organiser')).toBe(true);
    await setHidden(false);
    expect(await visibleTo('member')).toBe(true);
  });

  it('lets the owner write answers but never the derived visibility', async () => {
    const uid = harness.fixture.actors.organiser;
    await asUser(uid, (tx) =>
      tx.query("UPDATE taste_profiles SET tags = '{SUNRISE,MUSEUMS}' WHERE user_id = $1", [uid]),
    );
    await expect(
      asUser(uid, (tx) =>
        tx.query("UPDATE taste_profiles SET visibility = 'crew' WHERE user_id = $1", [uid]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("refuses writing someone else's profile", async () => {
    const { actors } = harness.fixture;
    await expect(
      asUser(actors.member, (tx) =>
        tx.query('INSERT INTO taste_profiles (user_id) VALUES ($1)', [actors.outsider]),
      ),
    ).rejects.toThrow(/row-level security/);
    const updated = await asUser(actors.member, (tx) =>
      tx.query("UPDATE taste_profiles SET tags = '{}' WHERE user_id = $1", [actors.organiser]),
    );
    expect(updated.rowCount).toBe(0);
  });

  it('derives visibility for a profile created after the tags were hidden', async () => {
    const uid = harness.fixture.actors.member;
    await asUser(uid, async (tx) => {
      await tx.query('INSERT INTO user_settings (user_id, hide_taste_tags) VALUES ($1, true)', [
        uid,
      ]);
      await tx.query("INSERT INTO taste_profiles (user_id, tags) VALUES ($1, '{NIGHT_OWL}')", [
        uid,
      ]);
    });
    const { rows } = await harness.db.pool.query<{ visibility: string }>(
      'SELECT visibility FROM taste_profiles WHERE user_id = $1',
      [uid],
    );
    expect(rows).toEqual([{ visibility: 'self' }]);
    expect(
      await asUser(
        harness.fixture.actors.organiser,
        async (tx) =>
          (await tx.query('SELECT 1 FROM taste_profiles WHERE user_id = $1', [uid])).rowCount,
      ),
    ).toBe(0);
  });
});

describe('the guide', () => {
  it('cannot read taste_profiles directly', async () => {
    const { fixture } = harness;
    await expect(
      withGuideReader(harness.db.pool, fixture.actors.member, fixture.tripId, (tx) =>
        tx.query('SELECT tags FROM taste_profiles'),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('sees crew-visible tags through llm.trip_context only while they are not hidden', async () => {
    await withSystem(harness.db.pool, (tx) =>
      tx.query("UPDATE taste_profiles SET tags = '{SUNRISE,MUSEUMS}' WHERE id = $1", [profileId]),
    );
    expect(await guideParticipantTags()).toEqual(['SUNRISE', 'MUSEUMS']);
    await setHidden(true);
    expect(await guideParticipantTags()).toBeNull();
  });
});

describe('taste_profiles in sync streams', () => {
  it('syncs to an active crewmate on crew_people until hidden, and always to the owner', async () => {
    expect(idsByTable(await harness.rows('crew_people', 'member'))['taste_profiles']).toContain(
      profileId,
    );
    await setHidden(true);
    expect(idsByTable(await harness.rows('crew_people', 'member'))['taste_profiles']).not.toContain(
      profileId,
    );
    expect(idsByTable(await harness.rows('me', 'organiser'))['taste_profiles']).toEqual([
      profileId,
    ]);
  });

  it.each(['outsider', 'exMember', 'anonymous'] as const)('never syncs it to the %s', async (a) => {
    const people = idsByTable(await harness.rows('crew_people', a))['taste_profiles'] ?? [];
    expect(people).not.toContain(profileId);
  });
});
