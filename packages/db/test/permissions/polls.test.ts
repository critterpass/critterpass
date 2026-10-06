/**
 * Poll permissions: crew members read a trip's polls, options, ballots and pitches; a voter casts
 * and changes only their own ballot, only while `app.can_vote` holds (open, eligible, still a
 * member); the state guard agrees with packages/domain/src/polls/state.ts; reveals are the
 * owner's alone; and `crew_polls` and `me` carry the rows (the trip stream keeps no copy).
 */
import { randomUUID } from 'node:crypto';

import { canTransitionPoll, POLL_STATUSES, type PollStatus } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let pollId: string;
let optionId: string;
let secondOptionId: string;

function as<T extends object = Record<string, unknown>>(
  uid: string,
  sql: string,
  params: unknown[] = [],
) {
  return withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query<T>(sql, params));
}

function asSystem<T extends object = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return withSystem(harness.db.pool, (tx) => tx.query<T>(sql, params));
}

async function count(uid: string, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await as<{ n: string }>(uid, `SELECT count(*) AS n FROM ${sql}`, params);
  return Number(rows[0]?.n ?? 0);
}

/** A fresh open generic poll on the fixture crew (no trip) with two options. */
async function crewPoll(
  eligible: readonly string[],
  extra: Partial<{ allowChange: boolean }> = {},
): Promise<{ id: string; options: string[] }> {
  const { crewId } = harness.fixture;
  const { rows } = await asSystem<{ id: string }>(
    `INSERT INTO polls (crew_id, kind, question, eligible_voter_ids, allow_change)
     VALUES ($1, 'generic', 'Dinner?', $2::uuid[], $3) RETURNING id`,
    [crewId, eligible, extra.allowChange ?? true],
  );
  const id = rows[0]!.id;
  const options: string[] = [];
  for (const [position, label] of ['Tacos', 'Ramen'].entries()) {
    const inserted = await asSystem<{ id: string }>(
      `INSERT INTO poll_options (poll_id, crew_id, kind, label, position)
       VALUES ($1, $2, 'text', $3, $4) RETURNING id`,
      [id, crewId, label, position],
    );
    options.push(inserted.rows[0]!.id);
  }
  return { id, options };
}

beforeAll(async () => {
  harness = await startStreamHarness();
  const { actors } = harness.fixture;
  const poll = await crewPoll([actors.organiser, actors.member]);
  pollId = poll.id;
  [optionId, secondOptionId] = poll.options as [string, string];
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('reading polls', () => {
  it('shows a trip poll, its options, ballots and pitches to active members only', async () => {
    const { tripId, crewId, actors } = harness.fixture;
    for (const table of ['polls', 'poll_options', 'ballots']) {
      expect(await count(actors.member, `${table} WHERE trip_id = $1`, [tripId])).toBe(1);
      expect(await count(actors.outsider, `${table} WHERE trip_id = $1`, [tripId])).toBe(0);
      expect(await count(actors.exMember, `${table} WHERE trip_id = $1`, [tripId])).toBe(0);
    }
    expect(await count(actors.member, 'pitches WHERE crew_id = $1', [crewId])).toBe(1);
    expect(await count(actors.outsider, 'pitches WHERE crew_id = $1', [crewId])).toBe(0);
  });

  it('refuses client writes to polls, options and pitches', async () => {
    const { crewId, actors } = harness.fixture;
    await expect(
      as(actors.member, `INSERT INTO polls (crew_id, kind) VALUES ($1, 'generic')`, [crewId]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(actors.member, "UPDATE polls SET status = 'closed' WHERE id = $1", [pollId]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(actors.member, "UPDATE poll_options SET label = 'x' WHERE poll_id = $1", [pollId]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(actors.member, "UPDATE pitches SET status = 'won' WHERE crew_id = $1", [crewId]),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('ballots', () => {
  const cast = (uid: string, option: string, poll = pollId) =>
    as(
      uid,
      `INSERT INTO ballots (poll_id, option_id, crew_id, user_id, op_id)
       VALUES ($1, $2, gen_random_uuid(), $3, gen_random_uuid())`,
      [poll, option, uid],
    );

  it('lets an eligible member vote and copies the scope from the poll', async () => {
    const { actors, crewId } = harness.fixture;
    await cast(actors.member, optionId);
    const { rows } = await asSystem<{ crew_id: string; trip_id: string | null }>(
      'SELECT crew_id, trip_id FROM ballots WHERE poll_id = $1 AND user_id = $2',
      [pollId, actors.member],
    );
    expect(rows).toEqual([{ crew_id: crewId, trip_id: null }]);
  });

  it('refuses a ballot for someone else', async () => {
    const { actors } = harness.fixture;
    await expect(
      as(
        actors.member,
        `INSERT INTO ballots (poll_id, option_id, crew_id, user_id, op_id)
         VALUES ($1, $2, gen_random_uuid(), $3, gen_random_uuid())`,
        [pollId, optionId, actors.organiser],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('refuses an ineligible member and an outsider (backstop)', async () => {
    const { actors } = harness.fixture;
    await expect(cast(actors.coOrganiser, optionId)).rejects.toThrow(/row-level security/i);
    await expect(cast(actors.outsider, optionId)).rejects.toThrow(/row-level security/i);
  });

  it('refuses an option from another poll', async () => {
    const { actors } = harness.fixture;
    const other = await crewPoll([actors.organiser]);
    await expect(cast(actors.organiser, optionId, other.id)).rejects.toThrow(/foreign key/i);
  });

  it('lets a voter change their mind while open, and only their own ballot', async () => {
    const { actors } = harness.fixture;
    await as(actors.member, 'UPDATE ballots SET option_id = $2 WHERE poll_id = $1', [
      pollId,
      secondOptionId,
    ]);
    const { rowCount } = await as(
      actors.organiser,
      'UPDATE ballots SET option_id = $2 WHERE poll_id = $1 AND user_id <> $3',
      [pollId, optionId, actors.organiser],
    );
    expect(rowCount).toBe(0);
    await expect(
      as(actors.member, 'UPDATE ballots SET user_id = $2 WHERE poll_id = $1', [
        pollId,
        actors.organiser,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses a change on a poll that does not allow one', async () => {
    const { actors } = harness.fixture;
    const fixed = await crewPoll([actors.member], { allowChange: false });
    await cast(actors.member, fixed.options[0]!, fixed.id);
    await expect(
      as(actors.member, 'UPDATE ballots SET option_id = $2 WHERE poll_id = $1', [
        fixed.id,
        fixed.options[1],
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it('refuses any ballot once the poll is closed', async () => {
    const { actors } = harness.fixture;
    const closed = await crewPoll([actors.organiser, actors.member]);
    await cast(actors.member, closed.options[0]!, closed.id);
    await asSystem(
      "UPDATE polls SET status = 'closed', closed_at = now(), winner_option_id = $2 WHERE id = $1",
      [closed.id, closed.options[0]],
    );
    await expect(cast(actors.organiser, closed.options[0]!, closed.id)).rejects.toThrow(
      /row-level security/i,
    );
    await expect(
      as(actors.member, 'UPDATE ballots SET option_id = $2 WHERE poll_id = $1', [
        closed.id,
        closed.options[1],
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it('never lets app_user delete a ballot', async () => {
    const { actors } = harness.fixture;
    await expect(
      as(actors.member, 'DELETE FROM ballots WHERE poll_id = $1', [pollId]),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('poll_reveals', () => {
  it('is the owner’s alone', async () => {
    const { actors } = harness.fixture;
    expect(await count(actors.organiser, 'poll_reveals')).toBe(1);
    expect(await count(actors.member, 'poll_reveals')).toBe(0);
    await as(actors.organiser, 'UPDATE poll_reveals SET seen_at = now()');
    await expect(
      as(actors.member, 'INSERT INTO poll_reveals (poll_id, user_id) VALUES ($1, $2)', [
        pollId,
        actors.organiser,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('poll state guard', () => {
  const walkTo = async (to: PollStatus) => {
    const { actors } = harness.fixture;
    const poll = await crewPoll([actors.member]);
    const winner = to === 'closed' ? poll.options[0] : null;
    return asSystem(
      `UPDATE polls SET status = $2, closed_at = CASE WHEN $2 = 'closed' THEN now() END,
         winner_option_id = $3 WHERE id = $1`,
      [poll.id, to, winner],
    ).then(
      () => poll.id,
      () => null,
    );
  };

  it.each(POLL_STATUSES)('agrees with the domain machine from open to %s', async (to) => {
    expect((await walkTo(to)) !== null).toBe(canTransitionPoll('open', to));
  });

  it.each(['closed', 'cancelled'] as const)('keeps %s terminal', async (from) => {
    const id = await walkTo(from);
    for (const to of POLL_STATUSES) {
      if (to === from) continue;
      await expect(
        asSystem('UPDATE polls SET status = $2, closed_at = NULL WHERE id = $1', [id, to]),
      ).rejects.toThrow(/illegal poll status transition|polls_closed_shape/);
      expect(canTransitionPoll(from, to)).toBe(false);
    }
  });

  it('rejects a poll born closed and a stage change on a non-destination poll', async () => {
    const { crewId } = harness.fixture;
    await expect(
      asSystem(
        `INSERT INTO polls (crew_id, kind, status, closed_at) VALUES ($1, 'generic', 'closed', now())`,
        [crewId],
      ),
    ).rejects.toThrow(/illegal initial poll status/);
    await expect(
      asSystem("UPDATE polls SET stage = 'final' WHERE id = $1", [pollId]),
    ).rejects.toThrow(/polls_stage_kind|illegal poll stage change/);
  });

  it('moves a destination poll between stages only while open', async () => {
    const { tripId } = harness.fixture;
    const { rows } = await asSystem<{ id: string }>(
      "SELECT id FROM polls WHERE trip_id = $1 AND kind = 'destination'",
      [tripId],
    );
    const destination = rows[0]!.id;
    await asSystem("UPDATE polls SET stage = 'final' WHERE id = $1", [destination]);
    await asSystem("UPDATE polls SET stage = 'board' WHERE id = $1", [destination]);
  });

  it('allows one open destination poll per crew', async () => {
    const { crewId, tripId } = harness.fixture;
    await expect(
      asSystem(
        `INSERT INTO polls (crew_id, trip_id, kind, stage) VALUES ($1, $2, 'destination', 'board')`,
        [crewId, tripId],
      ),
    ).rejects.toThrow(/polls_one_open_destination_key/);
  });
});

describe('streams', () => {
  it("carries a trip's polls, options, ballots and pitches on crew_polls, not again on trip", async () => {
    const { tripId } = harness.fixture;
    const crew = await harness.rows('crew_polls', 'member');
    const trip = await harness.rows('trip', 'member', { trip_id: tripId });
    for (const table of ['polls', 'poll_options', 'ballots', 'pitches']) {
      const ofTrip = (crew.get(table) ?? []).filter((row) => row['trip_id'] === tripId);
      expect(ofTrip.length, table).toBe(1);
      expect(trip.get(table) ?? [], table).toEqual([]);
    }
    const outsider = await harness.rows('crew_polls', 'outsider');
    for (const table of ['polls', 'poll_options', 'ballots', 'pitches']) {
      expect(outsider.get(table) ?? [], table).toEqual([]);
    }
  });

  it('carries every poll of the crew on crew_polls to active members only', async () => {
    const member = await harness.rows('crew_polls', 'member');
    const ids = (member.get('polls') ?? []).map((row) => row['id']);
    expect(ids).toContain(pollId);
    expect(
      (member.get('polls') ?? []).some((row) => row['trip_id'] === harness.fixture.tripId),
    ).toBe(true);
    expect((await harness.rows('crew_polls', 'exMember')).get('polls') ?? []).toEqual([]);
    expect((await harness.rows('crew_polls', 'outsider')).get('ballots') ?? []).toEqual([]);
  });

  it("carries only the caller's own reveals on me", async () => {
    const organiser = (await harness.rows('me', 'organiser')).get('poll_reveals') ?? [];
    expect(organiser.map((row) => row['user_id'])).toEqual([harness.fixture.actors.organiser]);
    expect((await harness.rows('me', 'member')).get('poll_reveals') ?? []).toEqual([]);
  });
});

describe('place destinations', () => {
  it('gives every city of a released place its own destination', async () => {
    const { rows } = await asSystem<{ release_id: string }>(
      "SELECT release_id FROM critter_sets WHERE code = 'zz'",
    );
    const release = rows[0]!.release_id;
    const set = await asSystem<{ id: string }>(
      `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
         hero_critter_key, month_hints, release_id)
       VALUES ('zq', 'Probeland', 'ZQ', 3, 'Africa/Casablanca', 'MAD', '{ar}', 'guest', 'cp-990',
         '[]', $1) RETURNING id`,
      [release],
    );
    await asSystem(
      `INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note, release_id)
       VALUES ('cp-990', $1, 990, 'Marrâkech', 'Stork', '{}', 1, 'Nests on rooftops.', $2)`,
      [set.rows[0]!.id, release],
    );
    const found = await asSystem<{ slug: string; coverage: string; country: string }>(
      'SELECT slug, coverage, country FROM destinations WHERE critter_set_id = $1',
      [set.rows[0]!.id],
    );
    expect(found.rows).toEqual([{ slug: 'zq-marrakech', coverage: 'guest', country: 'Probeland' }]);
  });
});
