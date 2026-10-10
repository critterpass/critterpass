/**
 * A crew's pass cover and handing a crew over, through the real `/v1/cmd` door against a migrated
 * Postgres: free covers for anyone, earned covers only for someone with the referral stamps; the
 * organiser handing the crew to a member they pick, staying on or leaving with their trip roles
 * going to that member; nobody else hands a crew over.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCrewCommands } from '../../src/commands/crews';
import { runCommand } from '../location/location-fixture';
import { type CommandDoorsHarness, type SignedIn } from '../routes/command-doors-harness';
import { startDoorsWithJobs } from './invite-fixture';

let harness: CommandDoorsHarness;

beforeAll(async () => {
  harness = await startDoorsWithJobs(registerCrewCommands);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function sql<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(text, params)).rows as T[];
}

async function startCrew(owner: SignedIn, extra: Record<string, unknown> = {}) {
  const crewId = generateUuidV7();
  const response = await runCommand(harness, owner, 'create_crew', {
    crew_id: crewId,
    name: 'Bali crew',
    ...extra,
  });
  return { crewId, status: response.status, body: response.body };
}

async function addMember(crewId: string, user: SignedIn): Promise<void> {
  await withSystem(harness.pool, (tx) =>
    tx.query(`INSERT INTO crew_members (crew_id, user_id, colour) VALUES ($1, $2, 'orange')`, [
      crewId,
      user.uid,
    ]),
  );
}

async function giveReferralStamps(user: SignedIn, count: number): Promise<void> {
  await withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO passes (user_id, status, number, issued_at)
       VALUES ($1, 'issued', app.format_pass_number(nextval('pass_number_seq')), now()) RETURNING id`,
      [user.uid],
    );
    for (let seq = 1; seq <= count; seq += 1) {
      await tx.query(
        `INSERT INTO stamps (pass_id, user_id, kind, seq_no, status, stamped_at)
         VALUES ($1, $2, 'referral', $3, 'stamped', now())`,
        [rows[0]!.id, user.uid, seq],
      );
    }
  });
}

async function role(crewId: string, user: SignedIn) {
  return sql<{ role: string; status: string }>(
    'SELECT role, status FROM crew_members WHERE crew_id = $1 AND user_id = $2',
    [crewId, user.uid],
  );
}

describe('crew cover', () => {
  it('takes a free cover from anyone and an earned one only with the stamps', async () => {
    const owner = await harness.signInAnonymously();
    const sky = await startCrew(owner, { cover: 'sky' });
    expect(sky.status).toBe(200);
    expect(await sql('SELECT cover FROM crews WHERE id = $1', [sky.crewId])).toEqual([
      { cover: 'sky' },
    ]);

    const navy = await startCrew(owner, { cover: 'navy' });
    expect(navy.status).toBe(403);
    expect(navy.body).toMatchObject({ error: { code: 'FORBIDDEN' } });

    const member = await harness.signInAnonymously();
    await addMember(sky.crewId, member);
    const locked = await runCommand(harness, member, 'update_crew', {
      crew_id: sky.crewId,
      cover: 'navy',
    });
    expect(locked.status).toBe(403);

    await giveReferralStamps(member, 3);
    const earned = await runCommand(harness, member, 'update_crew', {
      crew_id: sky.crewId,
      cover: 'navy',
    });
    expect(earned.status).toBe(200);
    const collector = await runCommand(harness, member, 'update_crew', {
      crew_id: sky.crewId,
      cover: 'collector',
    });
    expect(collector.status).toBe(403);
    expect(await sql('SELECT cover, name FROM crews WHERE id = $1', [sky.crewId])).toEqual([
      { cover: 'navy', name: 'Bali crew' },
    ]);

    const cleared = await runCommand(harness, owner, 'update_crew', {
      crew_id: sky.crewId,
      cover: null,
    });
    expect(cleared.status).toBe(200);
    expect(await sql('SELECT cover FROM crews WHERE id = $1', [sky.crewId])).toEqual([
      { cover: null },
    ]);
  });
});

describe('transfer_organiser', () => {
  it('hands the crew over and keeps the old organiser in as a member', async () => {
    const owner = await harness.signInAnonymously();
    const maya = await harness.signInAnonymously();
    const { crewId } = await startCrew(owner);
    await addMember(crewId, maya);

    const response = await runCommand(harness, owner, 'transfer_organiser', {
      crew_id: crewId,
      to_uid: maya.uid,
    });
    expect(response.status).toBe(200);
    expect(response.body['result']).toMatchObject({
      crew_id: crewId,
      organiser: maya.uid,
      left: false,
    });
    expect(await role(crewId, maya)).toEqual([{ role: 'organiser', status: 'active' }]);
    expect(await role(crewId, owner)).toEqual([{ role: 'member', status: 'active' }]);
    expect(
      await sql(
        `SELECT payload->>'user_id' AS user_id FROM domain_events
          WHERE type = 'crew.organiser_changed' AND aggregate_id = $1`,
        [crewId],
      ),
    ).toEqual([{ user_id: maya.uid }]);
  });

  it('gives the picked member the trips the leaver ran, then the leaver leaves', async () => {
    const owner = await harness.signInAnonymously();
    const early = await harness.signInAnonymously();
    const maya = await harness.signInAnonymously();
    const { crewId } = await startCrew(owner);
    await addMember(crewId, early);
    await addMember(crewId, maya);
    const tripId = await withSystem(harness.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
        [crewId],
      );
      const id = rows[0]!.id;
      for (const [user, seat] of [
        [owner, 'organiser'],
        [early, 'member'],
        [maya, 'member'],
      ] as const) {
        await tx.query(
          "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
          [id, user.uid, seat],
        );
      }
      return id;
    });

    const response = await runCommand(harness, owner, 'transfer_organiser', {
      crew_id: crewId,
      to_uid: maya.uid,
      leave: true,
      keep_in_chat: true,
    });
    expect(response.status).toBe(200);
    expect(response.body['result']).toMatchObject({ organiser: maya.uid, left: true });
    expect(await role(crewId, owner)).toEqual([{ role: 'organiser', status: 'former' }]);
    expect(await role(crewId, maya)).toEqual([{ role: 'organiser', status: 'active' }]);
    expect(await role(crewId, early)).toEqual([{ role: 'member', status: 'active' }]);
    expect(
      await sql(
        `SELECT user_id, role FROM trip_participants WHERE trip_id = $1 AND role = 'organiser'
          AND rsvp <> 'out'`,
        [tripId],
      ),
    ).toEqual([{ user_id: maya.uid, role: 'organiser' }]);
  });

  it('refuses a member, a stranger as the new organiser and the organiser themself', async () => {
    const owner = await harness.signInAnonymously();
    const member = await harness.signInAnonymously();
    const stranger = await harness.signInAnonymously();
    const { crewId } = await startCrew(owner);
    await addMember(crewId, member);

    const byMember = await runCommand(harness, member, 'transfer_organiser', {
      crew_id: crewId,
      to_uid: member.uid,
    });
    expect(byMember.status).toBe(403);
    const toStranger = await runCommand(harness, owner, 'transfer_organiser', {
      crew_id: crewId,
      to_uid: stranger.uid,
    });
    expect(toStranger.status).toBe(404);
    const toSelf = await runCommand(harness, owner, 'transfer_organiser', {
      crew_id: crewId,
      to_uid: owner.uid,
    });
    expect(toSelf.status).toBe(422);
    expect(await role(crewId, owner)).toEqual([{ role: 'organiser', status: 'active' }]);
  });
});
