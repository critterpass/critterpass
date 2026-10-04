/**
 * Balance the crew's private ask on the real stack: only an organiser may ask; the ask is a
 * two-party row nobody else can read, with nothing in crew chat; the asked member alone answers,
 * yes adds the saves under the organiser's authority, no closes it, and answering the same way
 * twice answers as it stands.
 */
import { withSystem, withUser } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCheckCommands } from '../../../src/commands/checks';
import { planStaySource } from '../../../src/planning/fit/context';
import { seedCurrentPlan } from '../../plan/plan-fixture';
import {
  buildSetupCrew,
  capturedOutputs,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from '../../setup/setup-harness';

const deps = { stays: planStaySource, now: () => new Date() };
const OPEN = {
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start: '08:00', end: '22:00' }]]),
  ),
};
let harness: SetupHarness;
let crew: SetupCrew;
let ideas: string[];

const organiser = () => crew.organiser;
const dev = () => crew.members[1]!;
const maya = () => crew.members[2]!;

async function save(name: string, lat: number): Promise<string> {
  return withSystem(harness.pool, async (tx) => {
    const { rows: poi } = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, curation, hours, editorial)
       SELECT destination_id, $2, 'other', $3, 135.76, 'editorial', $4, '{"time_needed_min": 60}'
         FROM trips WHERE id = $1 RETURNING id`,
      [crew.tripId, name, lat, JSON.stringify(OPEN)],
    );
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, backer_ids, sources)
       VALUES ($1, $2, $3, 'other', $4, 135.76, $5, '{save}') RETURNING id`,
      [crew.tripId, poi[0]!.id, name, lat, [dev().uid]],
    );
    return rows[0]!.id;
  });
}

const readsAsk = (uid: string, askId: string) =>
  withUser(
    harness.pool,
    uid,
    'unknown',
    async (tx) => (await tx.query('SELECT 1 FROM member_asks WHERE id = $1', [askId])).rowCount,
  );

const ask = (who = organiser(), ideaIds = ideas) =>
  harness.run(who, 'ask_member_about_saves', {
    trip_id: crew.tripId,
    user_id: dev().uid,
    idea_ids: ideaIds,
  });

/** The ask's id, or the whole answer when there is none (so a failure says why). */
async function asked(ideaIds = ideas): Promise<string> {
  const response = await ask(organiser(), ideaIds);
  const id = resultOf<{ ask_id?: string } | undefined>(response)?.ask_id;
  if (id === undefined) throw new Error(`no ask: ${JSON.stringify(response.body)}`);
  return id;
}

beforeAll(async () => {
  harness = await startSetupHarness((registry) => registerCheckCommands(registry, deps));
  crew = await buildSetupCrew(harness, 3);
  await withSystem(harness.pool, async (tx) => {
    for (const member of crew.members.slice(1)) {
      await tx.query(
        "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
        [crew.tripId, member.uid],
      );
    }
  });
  await seedCurrentPlan(harness.pool, crew.tripId);
  ideas = [await save('Seniman Coffee', 35.01), await save('Gianyar Night Market', 35.02)];
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('ask_member_about_saves', () => {
  it('is for organisers only', async () => {
    expect(errorOf(await ask(maya()))).toMatchObject({
      code: 'FORBIDDEN',
      detail: { reason: 'not_organiser' },
    });
  });

  it('writes a two-party ask nobody else reads, and nothing in crew chat', async () => {
    const before = await harness.pool.query('SELECT 1 FROM messages WHERE crew_id = $1', [
      crew.crewId,
    ]);
    const askId = await asked();
    expect(await readsAsk(organiser().uid, askId)).toBe(1);
    expect(await readsAsk(dev().uid, askId)).toBe(1);
    expect(await readsAsk(maya().uid, askId)).toBe(0);
    const after = await harness.pool.query('SELECT 1 FROM messages WHERE crew_id = $1', [
      crew.crewId,
    ]);
    expect(after.rowCount).toBe(before.rowCount);
    const row = await harness.pool.query<{ ops: { reason: string }[] }>(
      'SELECT ops FROM member_asks WHERE id = $1',
      [askId],
    );
    expect(row.rows[0]?.ops.map((op) => op.reason).sort()).toEqual([
      'Gianyar Night Market',
      'Seniman Coffee',
    ]);
    const outputs = await capturedOutputs(harness.pool);
    expect(outputs).not.toContain('Seniman Coffee');
    expect(await asked()).toBe(askId);
  });
});

describe('answer_member_ask', () => {
  it('only the asked member answers; yes adds the saves, and yes again answers as it stands', async () => {
    const askId = await asked();
    expect(
      errorOf(await harness.run(organiser(), 'answer_member_ask', { ask_id: askId, accept: true })),
    ).toMatchObject({ code: 'FORBIDDEN', detail: { reason: 'not_asked_member' } });
    expect(
      errorOf(await harness.run(maya(), 'answer_member_ask', { ask_id: askId, accept: true })),
    ).toMatchObject({ code: 'NOT_FOUND' });
    const yes = await harness.run(dev(), 'answer_member_ask', { ask_id: askId, accept: true });
    expect(resultOf(yes)).toEqual({ ask_id: askId, status: 'accepted', change_set_id: null });
    const added = await harness.pool.query(
      `SELECT 1 FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
        JOIN trip_ideas d ON d.poi_id = i.poi_id WHERE t.id = $1 AND d.id = ANY($2::uuid[])`,
      [crew.tripId, ideas],
    );
    expect(added.rowCount).toBe(2);
    const again = await harness.run(dev(), 'answer_member_ask', { ask_id: askId, accept: true });
    expect(resultOf(again)).toEqual({ ask_id: askId, status: 'accepted', change_set_id: null });
    const no = await harness.run(dev(), 'answer_member_ask', { ask_id: askId, accept: false });
    expect(errorOf(no)).toMatchObject({ code: 'STATE_INVALID', detail: { reason: 'ask_closed' } });
  });

  it('no closes the ask, and no again answers as it stands', async () => {
    const third = await save('Ubud Art Market', 35.03);
    const askId = await asked([third]);
    const no = await harness.run(dev(), 'answer_member_ask', { ask_id: askId, accept: false });
    expect(resultOf(no)).toEqual({ ask_id: askId, status: 'declined', change_set_id: null });
    const again = await harness.run(dev(), 'answer_member_ask', { ask_id: askId, accept: false });
    expect(resultOf(again)).toEqual({ ask_id: askId, status: 'declined', change_set_id: null });
  });
});
